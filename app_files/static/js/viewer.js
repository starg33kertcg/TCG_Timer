document.addEventListener('DOMContentLoaded', function () {
    const appContainer = document.getElementById('app-container');
    const promoWrapper = document.getElementById('promo-wrapper');
    const signageOverlay = document.getElementById('signage-overlay');
    const signageImage = document.getElementById('signage-image');
    const audioOverlay = document.getElementById('audio-start-overlay');

    const wrappers = {};
    const texts = {};
    const logos = {};
    const status = {};
    
    // Scale up to 4 timers
    for(let i = 1; i <= 4; i++) {
        wrappers[i] = document.getElementById(`timer-${i}-wrapper`);
        texts[i] = document.getElementById(`timer-${i}-text`);
        logos[i] = document.getElementById(`timer-${i}-logo`);
        status[i] = { times_up: false, low_time: false };
    }
    
    let sounds = { times_up: null, low_time: null };
    let player = null; 
    let audioReady = false;

    // --- SYNTHS FOR DEFAULT TONES ---
    const lowTimeSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sine" },
        envelope: { attack: 0.01, decay: 0.3, sustain: 0.0, release: 1 }
    }).toDestination();

    const timesUpSynth = new Tone.Synth({
        oscillator: { type: "square" }, 
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.0, release: 0.1 } 
    }).toDestination();

    // Initialize Audio Context via Overlay Click
    if (audioOverlay) {
        audioOverlay.addEventListener('click', async () => {
            await Tone.start();
            audioReady = true;
            console.log('Audio ready');
            audioOverlay.style.display = 'none';
        }, { once: true });
    }

    function play(type) {
        if (!audioReady || Tone.context.state !== 'running') return;
        const url = sounds[type];
        
        if (url) {
            if (!player) player = new Tone.Player().toDestination();
            if (player.state === 'started') player.stop();
            player.load(url).then(() => player.start()).catch(e => console.error(e));
        } else {
            const now = Tone.now();

            if (type === 'times_up') {
                const note = "B5"; 
                const speed = 0.12; 
                const gap = 1.2; 

                for (let i = 0; i < 4; i++) { 
                    const start = now + (i * gap);
                    timesUpSynth.triggerAttackRelease(note, "0.05", start);
                    timesUpSynth.triggerAttackRelease(note, "0.05", start + speed);
                    timesUpSynth.triggerAttackRelease(note, "0.05", start + speed*2);
                    timesUpSynth.triggerAttackRelease(note, "0.05", start + speed*3);
                }
            }
            else if (type === 'low_time') {
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
        
        if (h > 0) {
            return `${pad(h)}h${pad(m)}m${pad(s)}s`;
        } else {
            return `${pad(m)}m${pad(s)}s`;
        }
    }

    let signageIntervalId = null;
    let currentSignageIndex = 0;

    function update(data) {
        const theme = data.theme || {};
        document.body.style.backgroundColor = theme.background || '#000000';
        document.body.style.color = theme.font_color || '#FFFFFF';
        
        if (data.background_filename) {
            document.body.style.backgroundImage = `url(/static/backgrounds/${data.background_filename})`;
            document.body.style.backgroundSize = 'cover';
        } else {
            document.body.style.backgroundImage = 'none';
        }

        sounds.times_up = data.times_up_sound ? `/static/audio/${data.times_up_sound}` : null;
        sounds.low_time = data.low_time_sound ? `/static/audio/${data.low_time_sound}` : null;

        // --- SIGNAGE LOGIC ---
        if (data.signage && data.signage.enabled && data.signage.images && data.signage.images.length > 0) {
            appContainer.style.display = 'none';
            signageOverlay.style.display = 'block';

            if (!signageIntervalId) {
                signageImage.src = `/static/signage/${data.signage.images[0]}`;
                signageIntervalId = setInterval(() => {
                    currentSignageIndex = (currentSignageIndex + 1) % data.signage.images.length;
                    signageImage.src = `/static/signage/${data.signage.images[currentSignageIndex]}`;
                }, (data.signage.interval_seconds || 15) * 1000);
            }
            return; 
        } else {
            signageOverlay.style.display = 'none';
            if (signageIntervalId) {
                clearInterval(signageIntervalId);
                signageIntervalId = null;
            }
        }

        // --- ACTIVE TIMERS CALCULATION ---
        let activeCount = 0;
        Object.keys(data.timers).forEach(id => {
            if (data.timers[id].enabled) activeCount++;
        });

        appContainer.style.display = 'grid';
        appContainer.className = 'timer-container';
        if (activeCount === 1) appContainer.classList.add('layout-1');
        else if (activeCount === 2) appContainer.classList.add('layout-2');
        else if (activeCount >= 3) appContainer.classList.add('layout-4'); // Use 2x2 grid

        // --- PROMO GRAPHIC LOGIC ---
        if (activeCount === 3 && data.promo_graphic_filename) {
            promoWrapper.style.display = 'block';
            promoWrapper.style.backgroundImage = `url(/static/promo/${data.promo_graphic_filename})`;
        } else {
            promoWrapper.style.display = 'none';
        }

        // --- TIMERS UPDATE LOGIC ---
        Object.keys(data.timers).forEach(id => {
            if (!wrappers[id]) return;
            const t = data.timers[id];
            wrappers[id].style.display = t.enabled ? 'flex' : 'none';
            if (!t.enabled) return;

            const el = texts[id];
            
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
            
            if (t.logo_filename) { 
                logos[id].src = `/static/uploads/${t.logo_filename}`; 
                logos[id].style.display = 'block'; 
            } else {
                logos[id].style.display = 'none';
            }
        });
    }

    setInterval(() => {
        fetch('/api/timer_status').then(r=>r.json()).then(update).catch(console.error);
    }, 100);
});
