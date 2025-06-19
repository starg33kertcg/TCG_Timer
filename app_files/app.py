import os
import json
import hashlib
import uuid
from flask import Flask, request, jsonify, render_template, session, redirect, url_for, send_from_directory
from datetime import datetime, timedelta
from functools import wraps

app = Flask(__name__)
# For this setup, a new key is generated each time the service starts.
# This means login sessions will not survive a service restart.
app.secret_key = os.urandom(32)

# --- File paths ---
CONFIG_FILE = 'config.json'
UPLOAD_FOLDER = os.path.join('static', 'uploads')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# --- In-Memory State ---
timer_data = {
    "1": {"id": "1", "label": "Timer 1", "enabled": False, "end_time_utc_iso": None, "paused_time_remaining_seconds": None, "is_running": False, "initial_duration_seconds": 0, "logo_filename": None},
    "2": {"id": "2", "label": "Timer 2", "enabled": False, "end_time_utc_iso": None, "paused_time_remaining_seconds": None, "is_running": False, "initial_duration_seconds": 0, "logo_filename": None}
}


# --- Persistent Config Loading/Saving ---
def save_config(data_to_save):
    """Saves the configuration dictionary to config.json."""
    with open(CONFIG_FILE, 'w') as f:
        json.dump(data_to_save, f, indent=4)

def load_config():
    """Loads config.json, handling initial PIN hashing and adding theme defaults."""
    if not os.path.exists(CONFIG_FILE):
        return {"logos": [], "theme": {}} # Should not happen if setup.sh ran

    with open(CONFIG_FILE, 'r+') as f:
        try:
            config_data = json.load(f)

            # Hash PIN on first load if unhashed version exists
            if config_data.get("admin_pin_unhashed"):
                pin_to_hash = config_data["admin_pin_unhashed"]
                salt = os.urandom(16).hex()
                hashed_pin = hashlib.sha256((salt + pin_to_hash).encode('utf-8')).hexdigest()
                config_data["admin_pin_hashed"] = f"{salt}${hashed_pin}"
                del config_data["admin_pin_unhashed"]
                
                # Rewind file to overwrite it with the updated data
                f.seek(0)
                f.truncate()
                json.dump(config_data, f, indent=4)

            # For robustness, add default theme if it's missing
            if 'theme' not in config_data:
                config_data['theme'] = {
                    "background": "#000000",
                    "font_color": "#FFFFFF",
                    "low_time_minutes": 5,
                    "warning_enabled": True
                }
                # Rewind file to overwrite it
                f.seek(0)
                f.truncate()
                json.dump(config_data, f, indent=4)
                
            return config_data
        except (json.JSONDecodeError, KeyError):
            return {"logos": [], "theme": {}}


# --- Authentication ---
def check_pin(submitted_pin):
    """Verifies a submitted PIN against the hashed PIN in config.json."""
    current_config = load_config()
    if not current_config.get("admin_pin_hashed"):
        app.logger.error("Admin PIN not found in config.")
        return False
    try:
        salt, stored_hash = current_config["admin_pin_hashed"].split('$')
        return hashlib.sha256((salt + submitted_pin).encode('utf-8')).hexdigest() == stored_hash
    except (ValueError, AttributeError):
        app.logger.error("Admin PIN format error in config.")
        return False

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('admin_logged_in'):
            return redirect(url_for('login', next=request.url))
        return f(*args, **kwargs)
    return decorated_function


# --- Core Routes ---
@app.route('/login', methods=['GET', 'POST'])
def login():
    if session.get('admin_logged_in'):
        return redirect(url_for('admin_dashboard'))
    if request.method == 'POST':
        pin = request.form.get('pin')
        if check_pin(pin):
            session['admin_logged_in'] = True
            next_url = request.args.get('next')
            return redirect(next_url or url_for('admin_dashboard'))
        else:
            return render_template('admin_login.html', error="Invalid PIN")
    return render_template('admin_login.html')

@app.route('/logout')
def logout():
    session.pop('admin_logged_in', None)
    return redirect(url_for('login'))

@app.route('/')
def viewer():
    return render_template('viewer.html')

@app.route('/admin')
@login_required
def admin_dashboard():
    current_config = load_config()
    return render_template('admin_dashboard.html', timers_status=timer_data, logos=current_config.get('logos', []))


# --- API Routes ---
@app.route('/api/timer_status', methods=['GET'])
def get_timer_status_api():
    """Returns the live state of the timers AND the current theme settings."""
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
    return jsonify(response)

@app.route('/api/control_timer/<timer_id>', methods=['POST'])
@login_required
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

@app.route('/api/upload_logo', methods=['POST'])
@login_required
def upload_logo_api():
    if 'logo_file' not in request.files: return jsonify({"error": "No file part"}), 400
    file = request.files['logo_file']; common_name = request.form.get('common_name', '').strip()
    if file.filename == '': return jsonify({"error": "No selected file"}), 400
    if not common_name: return jsonify({"error": "Common name for logo is required"}), 400
    if file:
        filename_base = "".join(c if c.isalnum() or c in [' ', '_', '-'] else '_' for c in common_name).rstrip().replace(' ', '_')
        original_extension = os.path.splitext(file.filename)[1] or ".png"
        abs_upload_folder = os.path.join(app.root_path, UPLOAD_FOLDER)
        if not os.path.exists(abs_upload_folder): os.makedirs(abs_upload_folder)
        unique_filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:6]}_{filename_base}{original_extension}"
        filepath = os.path.join(abs_upload_folder, unique_filename)
        try:
            file.save(filepath)
            current_config = load_config()
            current_config.setdefault('logos', []).append({"name": common_name, "filename": unique_filename})
            save_config(current_config)
            return jsonify({"message": "Logo uploaded successfully", "logo": {"name": common_name, "filename": unique_filename}})
        except Exception as e:
            app.logger.error(f"Error saving logo: {e}")
            return jsonify({"error": f"Could not save logo: {str(e)}"}), 500
    return jsonify({"error": "Upload failed"}), 400

@app.route('/api/get_logos', methods=['GET'])
@login_required
def get_logos_api():
    return jsonify(load_config().get('logos', []))

@app.route('/api/delete_logo/<filename>', methods=['DELETE'])
@login_required
def delete_logo_api(filename):
    if '..' in filename or filename.startswith('/'): return jsonify({"error": "Invalid filename"}), 400
    current_config = load_config(); logos = current_config.get('logos', [])
    logo_to_delete = next((logo for logo in logos if logo["filename"] == filename), None)
    if not logo_to_delete: return jsonify({"error": "Logo not found in config"}), 404
    current_config['logos'] = [logo for logo in logos if logo["filename"] != filename]; save_config(current_config)
    try:
        filepath = os.path.join(app.root_path, UPLOAD_FOLDER, filename)
        if os.path.exists(filepath): os.remove(filepath)
    except Exception as e:
        app.logger.error(f"Error deleting logo file {filename}: {e}")
        return jsonify({"warning": f"Logo removed from list, but file deletion failed: {str(e)}"}), 500
    return jsonify({"message": f"Logo '{logo_to_delete['name']}' deleted successfully."})

@app.route('/api/change_pin', methods=['POST'])
@login_required
def change_pin_api():
    data = request.get_json(); current_pin = data.get('current_pin'); new_pin = data.get('new_pin')
    if not all([current_pin, new_pin]) or not current_pin.isdigit() or not new_pin.isdigit() or len(new_pin) != 5:
        return jsonify({"error": "PINs must be 5 numerical digits."}), 400
    if not check_pin(current_pin): return jsonify({"error": "Current PIN is incorrect."}), 403
    try:
        current_config = load_config(); salt = os.urandom(16).hex()
        hashed_pin = hashlib.sha256((salt + new_pin).encode('utf-8')).hexdigest()
        current_config["admin_pin_hashed"] = f"{salt}${hashed_pin}"; save_config(current_config)
        return jsonify({"message": "PIN changed successfully!"})
    except Exception as e:
        app.logger.error(f"Error changing PIN: {e}")
        return jsonify({"error": "An internal error occurred."}), 500

@app.route('/api/theme', methods=['GET', 'POST'])
@login_required
def theme_api():
    current_config = load_config()
    if request.method == 'POST':
        new_theme_data = request.get_json()
        current_config['theme'] = new_theme_data; save_config(current_config)
        return jsonify({"message": "Theme updated successfully!", "theme": new_theme_data})
    return jsonify(current_config.get('theme', {}))
