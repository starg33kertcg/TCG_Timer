import os
import json
import hashlib
import uuid
from waitress import serve
from flask import Flask, request, jsonify, render_template, session, redirect, url_for, send_from_directory
from datetime import datetime, timedelta
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = os.urandom(32)

# --- File paths ---
CONFIG_FILE = 'config.json'
UPLOAD_FOLDER = os.path.join('static', 'uploads')
AUDIO_FOLDER = os.path.join('static', 'audio')
BACKGROUNDS_FOLDER = os.path.join('static', 'backgrounds')

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['AUDIO_FOLDER'] = AUDIO_FOLDER
app.config['BACKGROUNDS_FOLDER'] = BACKGROUNDS_FOLDER

ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
ALLOWED_AUDIO_EXTENSIONS = {'mp3', 'wav', 'ogg'}

# --- In-Memory State ---
timer_data = {
    "1": {"id": "1", "label": "Timer 1", "enabled": False, "end_time_utc_iso": None, "paused_time_remaining_seconds": None, "is_running": False, "initial_duration_seconds": 0, "logo_filename": None},
    "2": {"id": "2", "label": "Timer 2", "enabled": False, "end_time_utc_iso": None, "paused_time_remaining_seconds": None, "is_running": False, "initial_duration_seconds": 0, "logo_filename": None}
}

# --- Utility Functions ---

def allowed_file(filename, allowed_extensions):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in allowed_extensions

def generate_unique_filename(filename, folder_name):
    # Generates a safe, unique filename
    extension = os.path.splitext(filename)[1]
    unique_id = uuid.uuid4().hex[:8]
    return secure_filename(f"{folder_name}_{unique_id}{extension}")

# --- Persistent Config Loading/Saving ---
def save_config(data_to_save):
    """Saves the configuration dictionary to config.json."""
    with open(CONFIG_FILE, 'w') as f:
        json.dump(data_to_save, f, indent=4)

def load_config():
    """Loads config.json, ensuring all necessary keys are present."""
    default_config = {
        "logos": [],
        "theme": {
            "background": "#000000",
            "font_color": "#FFFFFF",
            "low_time_minutes": 5,
            "warning_enabled": True
        },
        "custom_background_filename": None,
        "times_up_sound_filename": None,
        "low_time_sound_filename": None
    }
    
    if not os.path.exists(CONFIG_FILE):
        save_config(default_config)
        return default_config

    with open(CONFIG_FILE, 'r+') as f:
        try:
            config_data = json.load(f)
            
            # Merge defaults to ensure new keys are always present on load
            updated_config = default_config.copy()
            updated_config.update(config_data)

            # Check if an update occurred and rewrite the file
            if updated_config != config_data:
                f.seek(0)
                f.truncate()
                json.dump(updated_config, f, indent=4)

            return updated_config
        except (json.JSONDecodeError, KeyError):
            save_config(default_config)
            return default_config

# --- Core Routes (Authentication Removed) ---

@app.route('/')
def viewer():
    return render_template('viewer.html')

@app.route('/admin')
def admin_dashboard():
    current_config = load_config()
    return render_template('admin_dashboard.html', 
        timers_status=timer_data, 
        logos=current_config.get('logos', []),
        config=current_config
    )

# Serve uploaded files (logos, sounds, backgrounds)
@app.route('/static/audio/<filename>')
def serve_audio(filename):
    return send_from_directory(os.path.join(app.root_path, AUDIO_FOLDER), filename)

@app.route('/static/backgrounds/<filename>')
def serve_background(filename):
    return send_from_directory(os.path.join(app.root_path, BACKGROUNDS_FOLDER), filename)

# --- API Routes ---

# Updated status API to include new config keys
@app.route('/api/timer_status', methods=['GET'])
def get_timer_status_api():
    """Returns the live state of the timers AND config settings."""
    response = {}
    timers_response = {}
    now_utc = datetime.utcnow()
    for timer_id, data in timer_data.items():
        if not data["enabled"]:
            timers_response[timer_id] = {"time_remaining_seconds": 0, "is_running": False, "times_up": False, "enabled": False, "logo_filename": data["logo_filename"]}
            continue
        time_remaining = 0; times_up = False; current_is_running = data["is_running"]
        if data["is_running"] and data["end_time_utc_iso"]:
            end_time = datetime.fromisoformat(data["end_time_utc_iso"])
            remaining_delta = end_time - now_utc; time_remaining = max(0, int(remaining_delta.total_seconds()))
            if time_remaining == 0: times_up = True
        elif not data["is_running"] and data["paused_time_remaining_seconds"] is not None:
            time_remaining = data["paused_time_remaining_seconds"]
            if time_remaining == 0: times_up = True
        elif not data["is_running"] and data["initial_duration_seconds"] > 0 and data["end_time_utc_iso"] is None:
             time_remaining = data["initial_duration_seconds"]
        timers_response[timer_id] = {
            "time_remaining_seconds": time_remaining, "is_running": current_is_running,
            "times_up": times_up, "enabled": data["enabled"], "logo_filename": data["logo_filename"]
        }
    current_config = load_config()
    response['timers'] = timers_response
    response['theme'] = current_config.get('theme', {})
    response['background_filename'] = current_config.get('custom_background_filename')
    response['times_up_sound'] = current_config.get('times_up_sound_filename')
    response['low_time_sound'] = current_config.get('low_time_sound_filename')
    return jsonify(response)

@app.route('/api/control_timer/<timer_id>', methods=['POST'])
def control_timer_api(timer_id):

    if timer_id not in timer_data:
        return jsonify({"error": "Invalid timer ID"}), 400
    try:
        payload = request.get_json()
        if not payload or 'action' not in payload:
            return jsonify({"error": "Missing action in payload"}), 400
    except Exception as e:
        return jsonify({"error": f"Invalid JSON payload: {str(e)}"}), 400
    action = payload.get('action')
    td = timer_data[timer_id]
    if action == 'toggle_enable':
        td["enabled"] = payload.get('enabled', False)
        if not td["enabled"]:
            td.update({"end_time_utc_iso": None, "paused_time_remaining_seconds": 0, "is_running": False, "initial_duration_seconds": 0, "logo_filename": None})
    elif action == 'set_time':
        hours = int(payload.get('hours', 0)); minutes = int(payload.get('minutes', 0)); seconds = int(payload.get('seconds', 0))
        total_seconds = hours * 3600 + minutes * 60 + seconds
        td["initial_duration_seconds"] = total_seconds; td["paused_time_remaining_seconds"] = total_seconds
        td["is_running"] = False; td["end_time_utc_iso"] = None
    elif action == 'start':
        if td["enabled"]:
            duration_to_start_seconds = td["paused_time_remaining_seconds"] if td["paused_time_remaining_seconds"] is not None else td["initial_duration_seconds"]
            if duration_to_start_seconds > 0:
                td["end_time_utc_iso"] = (datetime.utcnow() + timedelta(seconds=duration_to_start_seconds)).isoformat()
                td["is_running"] = True; td["paused_time_remaining_seconds"] = None
    elif action == 'pause':
        if td["is_running"] and td["end_time_utc_iso"]:
            end_time = datetime.fromisoformat(td["end_time_utc_iso"])
            remaining_delta = end_time - datetime.utcnow()
            td["paused_time_remaining_seconds"] = max(0, int(remaining_delta.total_seconds())); td["is_running"] = False
    elif action == 'resume':
        if not td["is_running"] and td["paused_time_remaining_seconds"] is not None and td["paused_time_remaining_seconds"] > 0:
            td["end_time_utc_iso"] = (datetime.utcnow() + timedelta(seconds=td["paused_time_remaining_seconds"])).isoformat()
            td["is_running"] = True; td["paused_time_remaining_seconds"] = None
    elif action == 'reset':
        td["paused_time_remaining_seconds"] = td["initial_duration_seconds"]; td["is_running"] = False; td["end_time_utc_iso"] = None
    elif action == 'set_logo':
        td["logo_filename"] = payload.get('logo_filename')
    return jsonify({"message": f"Timer {timer_id} action {action} processed", "newState": td})

# --- Background Upload API ---
@app.route('/api/upload_background', methods=['POST'])
def upload_background_api():
    if 'background_file' not in request.files: return jsonify({"error": "No file part"}), 400
    file = request.files['background_file']
    if file.filename == '' or not allowed_file(file.filename, ALLOWED_IMAGE_EXTENSIONS): 
        return jsonify({"error": "Invalid file type. Must be PNG, JPG, or GIF."}), 400
    
    unique_filename = generate_unique_filename(file.filename, 'bg')
    filepath = os.path.join(app.root_path, app.config['BACKGROUNDS_FOLDER'], unique_filename)

    try:
        # Before saving the new file, delete the old one if it exists
        current_config = load_config()
        old_filename = current_config.get('custom_background_filename')
        if old_filename:
            old_filepath = os.path.join(app.root_path, app.config['BACKGROUNDS_FOLDER'], old_filename)
            if os.path.exists(old_filepath): os.remove(old_filepath)

        file.save(filepath)
        current_config['custom_background_filename'] = unique_filename
        save_config(current_config)
        return jsonify({"message": "Background uploaded successfully", "filename": unique_filename})
    except Exception as e:
        app.logger.error(f"Error saving background: {e}")
        return jsonify({"error": f"Could not save background: {str(e)}"}), 500

@app.route('/api/delete_background', methods=['DELETE'])
def delete_background_api():
    current_config = load_config()
    filename = current_config.get('custom_background_filename')
    if not filename: return jsonify({"message": "No background set."})

    try:
        filepath = os.path.join(app.root_path, app.config['BACKGROUNDS_FOLDER'], filename)
        if os.path.exists(filepath): os.remove(filepath)
        
        current_config['custom_background_filename'] = None
        save_config(current_config)
        return jsonify({"message": "Background deleted successfully."})
    except Exception as e:
        app.logger.error(f"Error deleting background file {filename}: {e}")
        return jsonify({"error": "Could not delete background file."}), 500

# --- Sound Upload API ---

@app.route('/api/upload_sound/<sound_type>', methods=['POST'])
def upload_sound_api(sound_type):
    if sound_type not in ['times_up', 'low_time']: 
        return jsonify({"error": "Invalid sound type."}), 400
        
    if 'sound_file' not in request.files: return jsonify({"error": "No file part"}), 400
    file = request.files['sound_file']
    if file.filename == '' or not allowed_file(file.filename, ALLOWED_AUDIO_EXTENSIONS): 
        return jsonify({"error": "Invalid file type. Must be MP3, WAV, or OGG."}), 400
    
    unique_filename = generate_unique_filename(file.filename, sound_type)
    filepath = os.path.join(app.root_path, app.config['AUDIO_FOLDER'], unique_filename)
    
    try:
        # Before saving the new file, delete the old one if it exists
        current_config = load_config()
        key = f'{sound_type}_sound_filename'
        old_filename = current_config.get(key)
        if old_filename:
            old_filepath = os.path.join(app.root_path, app.config['AUDIO_FOLDER'], old_filename)
            if os.path.exists(old_filepath): os.remove(old_filepath)

        file.save(filepath)
        current_config[key] = unique_filename
        save_config(current_config)
        return jsonify({"message": f"{sound_type.replace('_', ' ').title()} sound uploaded successfully", "filename": unique_filename})
    except Exception as e:
        app.logger.error(f"Error saving sound: {e}")
        return jsonify({"error": f"Could not save sound: {str(e)}"}), 500

@app.route('/api/delete_sound/<sound_type>', methods=['DELETE'])
def delete_sound_api(sound_type):
    if sound_type not in ['times_up', 'low_time']: 
        return jsonify({"error": "Invalid sound type."}), 400
    
    current_config = load_config()
    key = f'{sound_type}_sound_filename'
    filename = current_config.get(key)
    if not filename: return jsonify({"message": f"No custom {sound_type.replace('_', ' ')} sound set."})

    try:
        filepath = os.path.join(app.root_path, app.config['AUDIO_FOLDER'], filename)
        if os.path.exists(filepath): os.remove(filepath)
        
        current_config[key] = None
        save_config(current_config)
        return jsonify({"message": f"Custom {sound_type.replace('_', ' ')} sound deleted successfully."})
    except Exception as e:
        app.logger.error(f"Error deleting sound file {filename}: {e}")
        return jsonify({"error": "Could not delete sound file."}), 500

# --- Server Start ---
if __name__ == '__main__':
    # Ensure all upload directories exist before starting the server
    for folder in [UPLOAD_FOLDER, AUDIO_FOLDER, BACKGROUNDS_FOLDER]:
        os.makedirs(folder, exist_ok=True)
    
    # Load config initially to ensure it is up-to-date
    load_config() 
    
    # Start the Waitress server
    serve(app, host='0.0.0.0', port=5000)
