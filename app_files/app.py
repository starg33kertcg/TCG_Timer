import os
import json
import hashlib
import uuid
from flask import Flask, request, jsonify, render_template, session, redirect, url_for, send_from_directory
from datetime import datetime, timedelta
from functools import wraps

app = Flask(__name__)
app.secret_key = 'YOUR_KEY_HERE'  # Replace with a stronger secret key for session management

CONFIG_FILE = 'config.json'
UPLOAD_FOLDER = os.path.join('static', 'uploads') # Relative to app.py location
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# --- Timer States (In-memory) ---
# Initialized with default structure
timer_data = {
    "1": {"id": "1", "label": "Timer 1", "enabled": False, "end_time_utc_iso": None, "paused_time_remaining_seconds": None, "is_running": False, "initial_duration_seconds": 0, "logo_filename": None},
    "2": {"id": "2", "label": "Timer 2", "enabled": False, "end_time_utc_iso": None, "paused_time_remaining_seconds": None, "is_running": False, "initial_duration_seconds": 0, "logo_filename": None}
}

# --- Config Loading/Saving ---
def load_config():
    if not os.path.exists(CONFIG_FILE):
        # This should ideally be created by setup.sh from config_template.json
        # If not, create a default one (though setup.sh should handle initial PIN)
        default_config = {"admin_pin_hashed": None, "logos": [], "admin_pin_unhashed": "12345"} # Fallback
        save_config(default_config)
        return default_config

    with open(CONFIG_FILE, 'r') as f:
        current_config = json.load(f)

    # Hash PIN on first load if unhashed exists and no hashed pin yet
    if current_config.get("admin_pin_unhashed") and not current_config.get("admin_pin_hashed"):
        salt = os.urandom(16).hex()
        pin_to_hash = current_config["admin_pin_unhashed"]
        hashed_pin = hashlib.sha256((salt + pin_to_hash).encode('utf-8')).hexdigest()
        current_config["admin_pin_hashed"] = f"{salt}${hashed_pin}"
        del current_config["admin_pin_unhashed"] # Remove unhashed PIN
        save_config(current_config)
    return current_config

def save_config(data_to_save):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(data_to_save, f, indent=4)

config = load_config() # Load config when app starts

# --- Authentication ---
def check_pin(submitted_pin):
    if not config.get("admin_pin_hashed"):
        app.logger.error("Admin PIN not hashed or not found in config.")
        return False
    try:
        salt, stored_hash = config["admin_pin_hashed"].split('$')
        return hashlib.sha256((salt + submitted_pin).encode('utf-8')).hexdigest() == stored_hash
    except ValueError:
        app.logger.error("Admin PIN format error in config.")
        return False
    except Exception as e:
        app.logger.error(f"Error during PIN check: {e}")
        return False


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('admin_logged_in'):
            return redirect(url_for('login', next=request.url))
        return f(*args, **kwargs)
    return decorated_function

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

# --- Viewer Route ---
@app.route('/')
def viewer():
    return render_template('viewer.html')

# --- Admin Route ---
@app.route('/admin')
@login_required
def admin_dashboard():
    # Pass a copy to avoid modifying global state directly in template if not intended
    current_config = load_config() # Reload to get latest logos
    return render_template('admin_dashboard.html', timers_status=timer_data, logos=current_config.get('logos', []))

# --- API Routes ---
@app.route('/api/timer_status', methods=['GET'])
def get_timer_status_api():
    response = {}
    now_utc = datetime.utcnow()
    for timer_id, data in timer_data.items():
        if not data["enabled"]:
            response[timer_id] = {"time_remaining_seconds": 0, "is_running": False, "times_up": False, "enabled": False, "logo_filename": data["logo_filename"]}
            continue

        time_remaining = 0
        times_up = False
        current_is_running = data["is_running"]

        if data["is_running"] and data["end_time_utc_iso"]:
            end_time = datetime.fromisoformat(data["end_time_utc_iso"])
            remaining_delta = end_time - now_utc
            time_remaining = max(0, int(remaining_delta.total_seconds()))
            if time_remaining == 0:
                times_up = True
                # current_is_running = False # Timer stops itself when it hits zero
        elif not data["is_running"] and data["paused_time_remaining_seconds"] is not None:
            time_remaining = data["paused_time_remaining_seconds"]
            if time_remaining == 0: # If was paused exactly at zero
                 times_up = True
        elif not data["is_running"] and data["initial_duration_seconds"] > 0 and data["end_time_utc_iso"] is None: # Set but not started
             time_remaining = data["initial_duration_seconds"]


        response[timer_id] = {
            "time_remaining_seconds": time_remaining,
            "is_running": current_is_running, # Reflect if it should be running
            "times_up": times_up,
            "enabled": data["enabled"],
            "logo_filename": data["logo_filename"]
        }
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
    td = timer_data[timer_id] # Direct reference to modify

    if action == 'toggle_enable':
        td["enabled"] = payload.get('enabled', False)
        if not td["enabled"]: # Reset timer state if disabled
            td.update({"end_time_utc_iso": None, "paused_time_remaining_seconds": 0, "is_running": False, "initial_duration_seconds": 0, "logo_filename": None})

    elif action == 'set_time':
        hours = int(payload.get('hours', 0))
        minutes = int(payload.get('minutes', 0))
        seconds = int(payload.get('seconds', 0))
        total_seconds = hours * 3600 + minutes * 60 + seconds
        td["initial_duration_seconds"] = total_seconds
        td["paused_time_remaining_seconds"] = total_seconds # Display this time before start
        td["is_running"] = False
        td["end_time_utc_iso"] = None

    elif action == 'start':
        if td["enabled"]:
            duration_to_start_seconds = td["paused_time_remaining_seconds"] if td["paused_time_remaining_seconds"] is not None else td["initial_duration_seconds"]
            if duration_to_start_seconds > 0:
                td["end_time_utc_iso"] = (datetime.utcnow() + timedelta(seconds=duration_to_start_seconds)).isoformat()
                td["is_running"] = True
                td["paused_time_remaining_seconds"] = None # Clear paused state

    elif action == 'pause':
        if td["is_running"] and td["end_time_utc_iso"]:
            end_time = datetime.fromisoformat(td["end_time_utc_iso"])
            remaining_delta = end_time - datetime.utcnow()
            td["paused_time_remaining_seconds"] = max(0, int(remaining_delta.total_seconds()))
            td["is_running"] = False
            # td["end_time_utc_iso"] = None # Optional: clear end time if you always calculate from paused_remaining on resume

    elif action == 'resume':
        if not td["is_running"] and td["paused_time_remaining_seconds"] is not None and td["paused_time_remaining_seconds"] > 0:
            td["end_time_utc_iso"] = (datetime.utcnow() + timedelta(seconds=td["paused_time_remaining_seconds"])).isoformat()
            td["is_running"] = True
            td["paused_time_remaining_seconds"] = None

    elif action == 'reset':
        # Reset to initial duration if set, otherwise to 0. Keep enabled state and logo.
        td["paused_time_remaining_seconds"] = td["initial_duration_seconds"]
        td["is_running"] = False
        td["end_time_utc_iso"] = None

    elif action == 'set_logo':
        td["logo_filename"] = payload.get('logo_filename') # Can be None or empty string to remove logo

    app.logger.info(f"Timer {timer_id} action {action}. New state: {td}")
    return jsonify({"message": f"Timer {timer_id} action {action} processed", "newState": td})


@app.route('/api/upload_logo', methods=['POST'])
@login_required
def upload_logo_api():
    if 'logo_file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['logo_file']
    common_name = request.form.get('common_name', '').strip()

    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    if not common_name:
        return jsonify({"error": "Common name for logo is required"}), 400

    if file:
        # Sanitize common_name for use in filename, ensure extension is preserved
        filename_base = "".join(c if c.isalnum() or c in [' ', '_', '-'] else '_' for c in common_name).rstrip()
        filename_base = filename_base.replace(' ', '_')
        original_extension = os.path.splitext(file.filename)[1]
        if not original_extension: original_extension = ".png" # Default if no extension

        # Ensure UPLOAD_FOLDER exists
        abs_upload_folder = os.path.join(app.root_path, UPLOAD_FOLDER)
        if not os.path.exists(abs_upload_folder):
            os.makedirs(abs_upload_folder)
            
        unique_filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:6]}_{filename_base}{original_extension}"
        filepath = os.path.join(abs_upload_folder, unique_filename)

        try:
            file.save(filepath)
            app.logger.info(f"Logo saved: {filepath}")

            current_config = load_config() # Make sure it's the latest
            if 'logos' not in current_config or not isinstance(current_config['logos'], list):
                current_config['logos'] = []
            current_config['logos'].append({"name": common_name, "filename": unique_filename})
            save_config(current_config)

            return jsonify({"message": "Logo uploaded successfully", "logo": {"name": common_name, "filename": unique_filename}})
        except Exception as e:
            app.logger.error(f"Error saving logo: {e}")
            return jsonify({"error": f"Could not save logo: {str(e)}"}), 500
            
    return jsonify({"error": "Upload failed, file or common name issue."}), 400

@app.route('/api/get_logos', methods=['GET'])
@login_required
def get_logos_api():
    current_config = load_config()
    return jsonify(current_config.get('logos', []))

@app.route('/api/delete_logo/<filename>', methods=['DELETE'])
@login_required
def delete_logo_api(filename):
    current_config = load_config()
    logos = current_config.get('logos', [])
    
    # Prevent directory traversal
    if '..' in filename or filename.startswith('/'):
        return jsonify({"error": "Invalid filename"}), 400

    logo_to_delete = next((logo for logo in logos if logo["filename"] == filename), None)

    if not logo_to_delete:
        return jsonify({"error": "Logo not found in config"}), 404

    # Remove from config
    current_config['logos'] = [logo for logo in logos if logo["filename"] != filename]
    save_config(current_config)

    # Remove from filesystem
    try:
        filepath = os.path.join(app.root_path, UPLOAD_FOLDER, filename)
        if os.path.exists(filepath):
            os.remove(filepath)
            app.logger.info(f"Deleted logo file: {filepath}")
        else:
            app.logger.warning(f"Logo file not found for deletion: {filepath}")
    except Exception as e:
        app.logger.error(f"Error deleting logo file {filename}: {e}")
        # Log error but proceed with config change; admin might need to manually clean file
        return jsonify({"warning": f"Logo removed from list, but file deletion failed: {str(e)}"}), 500 # Partial success

    return jsonify({"message": f"Logo '{logo_to_delete['name']}' deleted successfully."})


if __name__ == '__main__':
    # This part is for direct execution (python app.py), not for Gunicorn
    # Ensure upload folder exists (Gunicorn setup should also ensure this via script)
    abs_upload_folder = os.path.join(app.root_path, UPLOAD_FOLDER)
    if not os.path.exists(abs_upload_folder):
        os.makedirs(abs_upload_folder)
        print(f"Created upload folder: {abs_upload_folder}")
    app.run(host='0.0.0.0', port=5000, debug=True)
