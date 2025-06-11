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

    // formatTime function
    function formatTime(totalSeconds) {
        if (totalSeconds < 0) totalSeconds = 0;
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;

        if (h === 0) { // If hours are zero
            return `${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`;
        } else {
            return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`;
        }
    }

    // updateTimerDisplay function
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
                elements.textEl.classList.remove('less-than-5', 'timer-text-mm-ss'); // Ensure mm-ss class is removed
            } else {
                elements.textEl.textContent = formatTime(displayTimeSeconds);
                elements.textEl.classList.remove('times-up');

                // ADD/REMOVE class for MMmSSs formatting
                const hoursRemaining = Math.floor(displayTimeSeconds / 3600);
                if (hoursRemaining === 0) {
                    elements.textEl.classList.add('timer-text-mm-ss');
                } else {
                    elements.textEl.classList.remove('timer-text-mm-ss');
                }
                // END ADD/REMOVE

                if (displayTimeSeconds > 0 && displayTimeSeconds < 300 && data.is_running) { // Less than 5 minutes and running
                    elements.textEl.classList.add('less-than-5');
                } else {
                    elements.textEl.classList.remove('less-than-5');
                }
            }

            if (data.logo_filename && data.logo_filename !== "None") { // Ensure "None" string check if backend might send it
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

    function adjustLayout() {
        const visibleTimers = Object.values(timerElements).filter(t => t.visible).length;
        // const container = document.querySelector('.timer-container'); // Not strictly needed to modify container class directly
        
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

    async function fetchTimerStates() {
        try {
            const response = await fetch('/api/timer_status');
            if (!response.ok) {
                console.error('Failed to fetch timer status:', response.status, await response.text());
                return;
            }
            const data = await response.json();
            for (const timerId in data) {
                if (timerElements[timerId] && data.hasOwnProperty(timerId)) {
                    updateTimerDisplay(timerId, data[timerId]);
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
