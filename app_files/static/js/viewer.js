document.addEventListener('DOMContentLoaded', function () {
    const timerElements = {
        '1': {
            wrapper: document.getElementById('timer-1-wrapper'),
            textEl: document.getElementById('timer-1-text'),
            logoEl: document.getElementById('timer-1-logo'),
            visible: false
        },
        '2': {
            wrapper: document.getElementById('timer-2-wrapper'),
            textEl: document.getElementById('timer-2-text'),
            logoEl: document.getElementById('timer-2-logo'),
            visible: false
        }
    };

    let currentTheme = { // Object to hold the latest theme settings
        low_time_minutes: 5,
        warning_enabled: true
    }; 

    function formatTime(totalSeconds) {
        if (totalSeconds < 0) totalSeconds = 0;
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;

        if (h === 0) {
            return `${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`;
        } else {
            return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`;
        }
    }

    function updateTimerDisplay(timerId, data) {
        const elements = timerElements[timerId];
        if (!elements) return;

        if (data.enabled) {
            elements.wrapper.style.display = 'flex';
            elements.visible = true;

            const displayTimeSeconds = data.time_remaining_seconds;

            if (data.times_up) {
                elements.textEl.textContent = 'TIMES UP';
                elements.textEl.classList.add('times-up');
                elements.textEl.classList.remove('low-time-warning', 'timer-text-mm-ss');
            } else {
                elements.textEl.textContent = formatTime(displayTimeSeconds);
                elements.textEl.classList.remove('times-up');

                // Add/remove class for MMmSSs font size formatting
                const hoursRemaining = Math.floor(displayTimeSeconds / 3600);
                if (hoursRemaining === 0) {
                    elements.textEl.classList.add('timer-text-mm-ss');
                } else {
                    elements.textEl.classList.remove('timer-text-mm-ss');
                }

                // Apply low time warning based on theme settings
                const lowTimeSeconds = (currentTheme.low_time_minutes || 5) * 60;
                const warningEnabled = currentTheme.warning_enabled !== false;
                
                if (warningEnabled && displayTimeSeconds > 0 && displayTimeSeconds < lowTimeSeconds && data.is_running) {
                    elements.textEl.classList.add('low-time-warning');
                } else {
                    elements.textEl.classList.remove('low-time-warning');
                }
            }

            if (data.logo_filename && data.logo_filename !== "None") {
                elements.logoEl.src = `/static/uploads/${data.logo_filename}`;
                elements.logoEl.style.display = 'block';
            } else {
                elements.logoEl.style.display = 'none';
            }
        } else {
            elements.wrapper.style.display = 'none';
            elements.visible = false;
        }
    }
    
    // New function to apply the theme from fetched data
    function applyTheme(theme) {
        if (!theme) return;
        currentTheme = theme; // Store for use in updateTimerDisplay
        document.body.style.backgroundColor = theme.background || '#000000';
        document.body.style.color = theme.font_color || '#FFFFFF';
    }

    function adjustLayout() {
        const visibleTimers = Object.values(timerElements).filter(t => t.visible).length;
        
        Object.values(timerElements).forEach(timer => {
            timer.wrapper.classList.remove('single-active', 'dual-active');
        });

        if (visibleTimers === 1) {
            Object.values(timerElements).forEach(timer => {
                if (timer.visible) {
                    timer.wrapper.classList.add('single-active');
                }
            });
        } else if (visibleTimers === 2) {
             Object.values(timerElements).forEach(timer => {
                if (timer.visible) {
                    timer.wrapper.classList.add('dual-active');
                }
            });
        }
    }

    // Main polling function, now handles new API response structure
    async function fetchTimerStates() {
        try {
            const response = await fetch('/api/timer_status');
            if (!response.ok) {
                console.error('Failed to fetch timer status:', response.status, await response.text());
                return;
            }
            const data = await response.json();
            
            // Apply theme from the API response first
            if (data.theme) {
                applyTheme(data.theme);
            }

            // Update timers using the 'timers' sub-object
            const timersData = data.timers || {};
            for (const timerId in timerElements) {
                if (timersData.hasOwnProperty(timerId)) {
                    updateTimerDisplay(timerId, timersData[timerId]);
                } else {
                    // If a timer is missing from response, treat it as disabled
                    updateTimerDisplay(timerId, { enabled: false });
                }
            }
            adjustLayout();
        } catch (error) {
            console.error('Error fetching timer states:', error);
        }
    }

    fetchTimerStates(); 
    setInterval(fetchTimerStates, 1000); 
});
