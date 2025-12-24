document.addEventListener('DOMContentLoaded', function () {
    const APP_CONTAINER = document.getElementById('app-container');
    const TIMER_CONTAINERS = {
        '1': document.getElementById('timer-1-container'),
        '2': document.getElementById('timer-2-container')
    };
    const TIMER_VALUES = {
        '1': document.getElementById('timer-1-value'),
        '2': document.getElementById('timer-2-value')
    };
    const TIMER_LOGOS = {
        '1': document.getElementById('timer-1-logo'),
        '2': document.getElementById('timer-2-logo')
    };
    const TIMER_STATUS = { '1': { times_up: false, low_time: false }, '2': { times_up: false, low_time: false } };
    
    // --- Audio State & Defaults ---
    let TIMES_UP_SOUND_URL = null;
    let LOW_TIME_SOUND_URL = null;
    let AUDIO_CONTEXT_INITIALIZED = false;

    // Default Tone.js synthesizers for built-in sounds
    const TimesUpSynth = new Tone.MembraneSynth().toDestination();
    const LowTimeSynth = new Tone.PolySynth(Tone.Synth).toDestination();

    // Custom sound player, initialized only when needed
    let customPlayer = null; 

    function initializeAudio() {
        if (!AUDIO_CONTEXT_INITIALIZED && Tone.context.state !== 'running') {
            document.body.addEventListener('click', () => {
                if (Tone.context.state !== 'running') {
                    Tone.start();
                    AUDIO_CONTEXT_INITIALIZED = true;
                    console.log('Audio Context started.');
                }
            }, { once: true });
        }
    }

    function playSound(type) {
        initializeAudio();
        const soundUrl = type === 'times_up' ? TIMES_UP_SOUND_URL : LOW_TIME_SOUND_URL;

        if (soundUrl && customPlayer) {
            // Use custom uploaded sound
            customPlayer.load(soundUrl).then(() => {
                customPlayer.start();
            }).catch(e => console.error(`Error playing custom ${type} sound:`, e));
        } else if (type === 'times_up') {
            // Default "Times Up" tone (low, deep thud)
            TimesUpSynth.triggerAttackRelease("C1", "1n");
        } else if (type === 'low_time') {
            // Default "Low Time" tone (short, high beep)
            LowTimeSynth.triggerAttackRelease(["C5"], "8n");
        }
    }
    
    // --- Core Polling Logic ---

    function updateViewer(data) {
        const theme = data.theme || {};
        const lowTimeSeconds = (theme.low_time_minutes || 5) * 60;
        
        // 1. Apply Theme and Background
        APP_CONTAINER.style.backgroundColor = theme.background || '#000000';
        APP_CONTAINER.style.color = theme.font_color || '#FFFFFF';
        
        if (data.background_filename) {
             APP_CONTAINER.style.backgroundImage = `url(/static/backgrounds/${data.background_filename})`;
             APP_CONTAINER.style.backgroundSize = 'cover';
             APP_CONTAINER.style.backgroundPosition = 'center';
             APP_CONTAINER.style.backgroundAttachment = 'fixed';
        } else {
             APP_CONTAINER.style.backgroundImage = 'none';
        }

        // 2. Configure Custom Audio URLs
        // If a custom sound is set, configure the player
        if (data.times_up_sound || data.low_time_sound) {
            if (!customPlayer) {
                 customPlayer = new Tone.Player().toDestination();
            }
            TIMES_UP_SOUND_URL = data.times_up_sound ? `/static/audio/${data.times_up_sound}` : null;
            LOW_TIME_SOUND_URL = data.low_time_sound ? `/static/audio/${data.low_time_sound}` : null;
        } else {
            TIMES_UP_SOUND_URL = null;
            LOW_TIME_SOUND_URL = null;
        }


        // 3. Update Timers, Logos, and Sounds
        Object.keys(data.timers).forEach(timerId => {
            const timer = data.timers[timerId];
            const container = TIMER_CONTAINERS[timerId];
            const valueDisplay = TIMER_VALUES[timerId];

            // Hide/Show Container
            container.style.display = timer.enabled ? 'flex' : 'none';
            if (!timer.enabled) return;

            // Times Up Status
            if (timer.times_up && !TIMER_STATUS[timerId].times_up) {
                // TIMES UP TRIGGER
                if (theme.warning_enabled !== false) {
                     playSound('times_up');
                }
                valueDisplay.classList.add('times-up');
            } else if (!timer.times_up && TIMER_STATUS[timerId].times_up) {
                valueDisplay.classList.remove('times-up');
            }
            TIMER_STATUS[timerId].times_up = timer.times_up;
            
            // Low Time Status
            const isLowTime = !timer.times_up && timer.is_running && timer.time_remaining_seconds <= lowTimeSeconds;
            if (isLowTime && !TIMER_STATUS[timerId].low_time) {
                // LOW TIME TRIGGER
                if (theme.warning_enabled !== false) {
                    playSound('low_time');
                }
                valueDisplay.classList.add('low-time');
            } else if (!isLowTime && TIMER_STATUS[timerId].low_time) {
                valueDisplay.classList.remove('low-time');
            }
            TIMER_STATUS[timerId].low_time = isLowTime;

            // Timer Value Display
            const totalSeconds = timer.time_remaining_seconds;
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            
            valueDisplay.textContent = 
                `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            
            // Logo Display
            const logoElement = TIMER_LOGOS[timerId];
            if (timer.logo_filename) {
                logoElement.src = `/static/uploads/${timer.logo_filename}`;
                logoElement.style.display = 'block';
            } else {
                logoElement.style.display = 'none';
            }
            
            // Running State (Visual Flashing)
            container.classList.toggle('running', timer.is_running);
            container.classList.toggle('paused', !timer.is_running && !timer.times_up && timer.enabled);
        });
    }

    function pollAPI() {
        fetch('/api/timer_status')
            .then(r => r.json())
            .then(updateViewer)
            .catch(error => console.error('Error fetching timer status:', error));
    }

    // Start polling immediately and then every 100 milliseconds for smooth updates
    pollAPI();
    setInterval(pollAPI, 100); 
    
    // Initial call to ensure audio context can start on first click/interaction
    initializeAudio();
});
