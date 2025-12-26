import os
import json
import hashlib
import uuid
from waitress import serve
from flask import Flask, request, jsonify, render_template, session, redirect, url_for, send_from_directory
from datetime import datetime, timedelta
from werkzeug.utils import secure_filename
from functools import wraps

app = Flask(__name__)
# For this setup, a new key is generated each time the service starts.
# This means login sessions will not survive a service restart.
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
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_extensions

def generate_unique_filename(filename, folder_name):
    extension = os.path.splitext(filename)[1]
    unique_id = uuid.uuid4().hex[:8]
    return secure_filename(f"{folder_name}_{unique_id}{extension}")

def save_config(data_to_save):
    """Saves the configuration dictionary to config.json."""
    with open(CONFIG_FILE, 'w') as f:
        json.dump(data_to_save, f, indent=4)

def load_config():
    """Loads config.json, handling initial PIN hashing and adding theme defaults."""
    default_config = {
        "logos": [],
        "theme": {
            "background": "#000000",
            "font_color": "#FFFFFF",
            "low_time_minutes": 5,
            "warning_enabled": True,
            "low_time_color": "#FF0000"
        },
        "custom_background_filename": None,
        "times_up_sound_filename": None,
        "low_time_sound_filename": None
    }
    
    if not os.path.exists(CONFIG_FILE):
        # If no config exists, creating one (usually setup.sh handles this, but safe fallback)
        save_config(default_config)
        return default_config

    with open(CONFIG_FILE, 'r+') as f:
        try:
            config_data = json.load(f)
            updated = False

            # Hash PIN on first load if unhashed version exists
            if config_data.get("admin_pin_unhashed"):
                pin_to_hash = config_data["admin_pin_unhashed"]
                salt = os.urandom(16).hex()
                hashed_pin = hashlib.sha256((salt + pin_to_hash).encode('utf-8')).hexdigest()
                config_data["admin_pin_hashed"] = f"{salt}${hashed_pin}"
                del config_data["admin_pin_unhashed"]
                updated = True

            # Merge defaults to ensure new keys are always present
            # We copy default_config and update it with loaded data to ensure structure
            # However, we must be careful not to overwrite nested theme dicts completely if partial keys exist
            
            # Simple merge strategy: ensure top level keys exist
            for key, value in default_config.items():
                if key not in config_data:
                    config_data[key] = value
                    updated = True
            
            # Specific nested merge for theme
            if "theme" in config_data:
                for key, value in default_config["theme"].items():
                    if key not in config_data["theme"]:
                        config_data["theme"][key] = value
                        updated = True
            else:
                config_data["theme"] = default_config["theme"]
                updated = True

            if updated:
                f.seek(0)
                f.truncate()
                json.dump(config_data, f, indent=4)

            return config_data
        except (json.JSONDecodeError, KeyError):
            return default_config

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
    return render_template('admin_dashboard.html', 
        timers_status=timer_data, 
        logos=current_config.get('logos', []),
        config=current_config
    )

# --- Serving Files ---
@app.route('/static/uploads/<filename>')
def serve_uploads(filename): return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/static/audio/<filename>')
def serve_audio(filename): return send_from_directory(app.config['AUDIO_FOLDER'], filename)

@app.route('/static/backgrounds/<filename>')
def serve_background(filename): return send_from_directory(app.config['BACKGROUNDS_FOLDER'], filename)

# --- API Routes ---

@app.route('/api/timer_status', methods=['GET'])
def get_timer_status_api():
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
        elif not data["is_running"] and data["initial_duration_seconds"] > 0:
             time_remaining = data["initial_duration_seconds"]
        timers_response[timer_id] = {
            "time_remaining_seconds": time_remaining, "is_running": current_is_running,
            "times_up": times_up, "enabled": data["enabled"], "logo_filename": data["logo_filename"]
        }
    current_config = load_config()
    return jsonify({
        'timers': timers_response,
        'theme': current_config.get('theme', {}),
        'background_filename': current_config.get('custom_background_filename'),
        'times_up_sound': current_config.get('times_up_sound_filename'),
        'low_time_sound': current_config.get('low_time_sound_filename')
    })

@app.route('/api/control_timer/<timer_id>', methods=['POST'])
@login_required
def control_timer_api(timer_id):
    if timer_id not in timer_data: return jsonify({"error": "Invalid timer ID"}), 400
    try: payload = request.get_json()
    except: return jsonify({"error": "Invalid JSON"}), 400
    action = payload.get('action')
    td = timer_data[timer_id]
    
    if action == 'toggle_enable':
        td["enabled"] = payload.get('enabled', False)
        if not td["enabled"]:
            td.update({"end_time_utc_iso": None, "paused_time_remaining_seconds": 0, "is_running": False, "initial_duration_seconds": 0, "logo_filename": None})
    elif action == 'set_time':
        h, m, s = int(payload.get('hours', 0)), int(payload.get('minutes', 0)), int(payload.get('seconds', 0))
        total = h * 3600 + m * 60 + s
        td.update({"initial_duration_seconds": total, "paused_time_remaining_seconds": total, "is_running": False, "end_time_utc_iso": None})
    elif action == 'start':
        if td["enabled"]:
            dur = td["paused_time_remaining_seconds"] if td["paused_time_remaining_seconds"] is not None else td["initial_duration_seconds"]
            if dur > 0:
                td["end_time_utc_iso"] = (datetime.utcnow() + timedelta(seconds=dur)).isoformat()
                td["is_running"] = True; td["paused_time_remaining_seconds"] = None
    elif action == 'pause':
        if td["is_running"] and td["end_time_utc_iso"]:
            rem = datetime.fromisoformat(td["end_time_utc_iso"]) - datetime.utcnow()
            td["paused_time_remaining_seconds"] = max(0, int(rem.total_seconds())); td["is_running"] = False
    elif action == 'resume':
        if not td["is_running"] and td["paused_time_remaining_seconds"] and td["paused_time_remaining_seconds"] > 0:
            td["end_time_utc_iso"] = (datetime.utcnow() + timedelta(seconds=td["paused_time_remaining_seconds"])).isoformat()
            td["is_running"] = True; td["paused_time_remaining_seconds"] = None
    elif action == 'reset':
        td.update({"paused_time_remaining_seconds": td["initial_duration_seconds"], "is_running": False, "end_time_utc_iso": None})
    elif action == 'set_logo':
        td["logo_filename"] = payload.get('logo_filename')
    return jsonify({"message": f"Timer {timer_id} action {action} processed", "newState": td})

# --- Upload Handlers ---
@app.route('/api/upload_logo', methods=['POST'])
@login_required
def upload_logo_api():
    if 'logo_file' not in request.files: return jsonify({"error": "No file part"}), 400
    file = request.files['logo_file']; common_name = request.form.get('common_name', '').strip()
    if file and allowed_file(file.filename, ALLOWED_IMAGE_EXTENSIONS):
        fname = generate_unique_filename(file.filename, 'logo')
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], fname))
        cfg = load_config()
        cfg.setdefault('logos', []).append({"name": common_name, "filename": fname})
        save_config(cfg)
        return jsonify({"message": "Uploaded", "logo": {"name": common_name, "filename": fname}})
    return jsonify({"error": "Upload failed"}), 400

@app.route('/api/get_logos', methods=['GET'])
@login_required
def get_logos_api(): return jsonify(load_config().get('logos', []))

@app.route('/api/delete_logo/<filename>', methods=['DELETE'])
@login_required
def delete_logo_api(filename):
    cfg = load_config(); cfg['logos'] = [l for l in cfg.get('logos',[]) if l['filename'] != filename]; save_config(cfg)
    try: os.remove(os.path.join(app.config['UPLOAD_FOLDER'], filename))
    except: pass
    return jsonify({"message": "Deleted"})

@app.route('/api/theme', methods=['GET', 'POST'])
@login_required
def theme_api():
    cfg = load_config()
    if request.method == 'POST':
        cfg['theme'] = request.get_json(); save_config(cfg)
        return jsonify({"message": "Saved"})
    return jsonify(cfg.get('theme', {}))

@app.route('/api/upload_background', methods=['POST'])
@login_required
def upload_bg():
    if 'background_file' not in request.files: return jsonify({"error": "No file"}), 400
    file = request.files['background_file']
    if file and allowed_file(file.filename, ALLOWED_IMAGE_EXTENSIONS):
        fname = generate_unique_filename(file.filename, 'bg')
        file.save(os.path.join(app.config['BACKGROUNDS_FOLDER'], fname))
        cfg = load_config()
        if cfg.get('custom_background_filename'):
            try: os.remove(os.path.join(app.config['BACKGROUNDS_FOLDER'], cfg['custom_background_filename']))
            except: pass
        cfg['custom_background_filename'] = fname; save_config(cfg)
        return jsonify({"message": "Background Set", "filename": fname})
    return jsonify({"error": "Invalid file"}), 400

@app.route('/api/delete_background', methods=['DELETE'])
@login_required
def delete_bg():
    cfg = load_config(); fname = cfg.get('custom_background_filename')
    if fname:
        try: os.remove(os.path.join(app.config['BACKGROUNDS_FOLDER'], fname))
        except: pass
        cfg['custom_background_filename'] = None; save_config(cfg)
    return jsonify({"message": "Deleted"})

@app.route('/api/upload_sound/<stype>', methods=['POST'])
@login_required
def upload_sound(stype):
    if stype not in ['times_up', 'low_time']: return jsonify({"error": "Invalid type"}), 400
    if 'sound_file' not in request.files: return jsonify({"error": "No file"}), 400
    file = request.files['sound_file']
    if file and allowed_file(file.filename, ALLOWED_AUDIO_EXTENSIONS):
        fname = generate_unique_filename(file.filename, stype)
        file.save(os.path.join(app.config['AUDIO_FOLDER'], fname))
        cfg = load_config(); key = f'{stype}_sound_filename'
        if cfg.get(key):
            try: os.remove(os.path.join(app.config['AUDIO_FOLDER'], cfg[key]))
            except: pass
        cfg[key] = fname; save_config(cfg)
        return jsonify({"message": "Sound Set", "filename": fname})
    return jsonify({"error": "Invalid file"}), 400

@app.route('/api/delete_sound/<stype>', methods=['DELETE'])
@login_required
def delete_sound(stype):
    cfg = load_config(); key = f'{stype}_sound_filename'; fname = cfg.get(key)
    if fname:
        try: os.remove(os.path.join(app.config['AUDIO_FOLDER'], fname))
        except: pass
        cfg[key] = None; save_config(cfg)
    return jsonify({"message": "Deleted"})

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

if __name__ == '__main__':
    for f in [UPLOAD_FOLDER, AUDIO_FOLDER, BACKGROUNDS_FOLDER]:
        os.makedirs(f, exist_ok=True)
    load_config()
    serve(app, host='0.0.0.0', port=5000)
