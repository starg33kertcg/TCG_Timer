document.addEventListener('DOMContentLoaded', function () {
    const wrappers = {
        '1': document.getElementById('timer-1-wrapper'),
        '2': document.getElementById('timer-2-wrapper')
    };
    const texts = {
        '1': document.getElementById('timer-1-text'),
        '2': document.getElementById('timer-2-text')
    };
    const logos = {
        '1': document.getElementById('timer-1-logo'),
        '2': document.getElementById('timer-2-logo')
    };
    const status = { '1': { times_up: false, low_time: false }, '2': { times_up: false, low_time: false } };
    
    let sounds = { times_up: null, low_time: null };
    let player = null; 

    // --- SYNTHS FOR DEFAULT TONES (Digital Alarm Style) ---
    const lowTimeSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sine" },
        envelope: { attack: 0.01, decay: 0.3, sustain: 0.0, release: 1 }
    }).toDestination();

    const timesUpSynth = new Tone.Synth({
        oscillator: { type: "square" }, // Square wave for "alarm" sound
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.0, release: 0.1 }
    }).toDestination();

    // Initialize Audio Context
    document.body.addEventListener('click', async () => {
        await Tone.start();
        console.log('Audio ready');
    }, { once: true });

    function play(type) {
        if (Tone.context.state !== 'running') return;
        const url = sounds[type];
        
        if (url) {
            if (!player) player = new Tone.Player().toDestination();
            if (player.state === 'started') player.stop();
            player.load(url).then(() => player.start()).catch(e => console.error(e));
        } else {
            const now = Tone.now();
            if (type === 'times_up') {
                // "bee-de-de-beep" pattern
                const note = "B5"; const speed = 0.12; const gap = 1.2;
                for (let i = 0; i < 4; i++) {
                    const start = now + (i * gap);
                    timesUpSynth.triggerAttackRelease(note, "0.05", start);
                    timesUpSynth.triggerAttackRelease(note, "0.05", start + speed);
                    timesUpSynth.triggerAttackRelease(note, "0.05", start + speed*2);
                    timesUpSynth.triggerAttackRelease(note, "0.05", start + speed*3);
                }
            } else if (type === 'low_time') {
                // 3 clean dings
                lowTimeSynth.triggerAttackRelease("C6", "0.2", now);
                lowTimeSynth.triggerAttackRelease("C6", "0.2", now + 0.5);
                lowTimeSynth.triggerAttackRelease("C6", "0.2", now + 1.0);
            }
        }
    }

    function format(seconds) {
        if (seconds < 0) seconds = 0;
        const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
        const pad = (n) => String(n).padStart(2, '0');
        if (h > 0) return `${pad(h)}h${pad(m)}m${pad(s)}s`;
        else return `${pad(m)}m${pad(s)}s`;
    }

    function update(data) {
        const theme = data.theme || {};
        document.body.style.backgroundColor = theme.background || '#000000';
        document.body.style.color = theme.font_color || '#FFFFFF';
        
        if (data.background_filename) {
            document.body.style.backgroundImage = `url(/static/backgrounds/${data.background_filename})`;
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center'; // added positioning
            document.body.style.backgroundAttachment = 'fixed'; // added attachment
        } else {
            document.body.style.backgroundImage = 'none';
        }

        sounds.times_up = data.times_up_sound ? `/static/audio/${data.times_up_sound}` : null;
        sounds.low_time = data.low_time_sound ? `/static/audio/${data.low_time_sound}` : null;

        Object.keys(data.timers).forEach(id => {
            if (!wrappers[id]) return;
            const t = data.timers[id];
            wrappers[id].style.display = t.enabled ? 'flex' : 'none';
            if (!t.enabled) return;

            const el = texts[id];
            
            // Logic for "TIME'S UP" and Low Time Color
            if (t.times_up) {
                el.textContent = "TIME'S UP";
                el.style.color = theme.low_time_color || theme.font_color || '#FF0000';
                if (!status[id].times_up) {
                    if (theme.warning_enabled !== false) play('times_up');
                    el.classList.add('times-up'); 
                }
            } else {
                el.textContent = format(t.time_remaining_seconds);
                el.classList.remove('times-up');
                
                const low = t.is_running && t.time_remaining_seconds <= (theme.low_time_minutes||5)*60;
                if (low) {
                    el.style.color = theme.low_time_color || '#FF0000';
                    if (!status[id].low_time) {
                        if (theme.warning_enabled !== false) play('low_time');
                        el.classList.add('low-time');
                    }
                } else {
                    el.style.color = theme.font_color || '#FFFFFF'; 
                    el.classList.remove('low-time');
                }
                status[id].low_time = low;
            }
            
            status[id].times_up = t.times_up;
            
            if (t.logo_filename) { logos[id].src = `/static/uploads/${t.logo_filename}`; logos[id].style.display = 'block'; }
            else logos[id].style.display = 'none';
            
            wrappers[id].classList.toggle('running', t.is_running);
            wrappers[id].classList.toggle('paused', !t.is_running && !t.times_up && t.enabled);
        });
        
        const visible = Object.values(wrappers).filter(w => w.style.display !== 'none').length;
        Object.values(wrappers).forEach(w => {
            w.classList.remove('single-active', 'dual-active');
            if (w.style.display !== 'none') {
                if (visible === 1) w.classList.add('single-active');
                if (visible === 2) w.classList.add('dual-active');
            }
        });
    }

    setInterval(() => {
        fetch('/api/timer_status').then(r=>r.json()).then(update).catch(console.error);
    }, 100);
    
});
