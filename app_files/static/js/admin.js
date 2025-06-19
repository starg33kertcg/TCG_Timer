document.addEventListener('DOMContentLoaded', function () {
    const themeToggleButton = document.getElementById('theme-toggle');
    const body = document.body;

    // --- Core Functions ---
    // Theme preference for the admin dashboard itself
    const currentTheme = localStorage.getItem('theme');
    if (currentTheme === 'dark') {
        body.classList.add('dark-theme');
    }
    if (themeToggleButton) {
        themeToggleButton.addEventListener('click', () => {
            body.classList.toggle('dark-theme');
            localStorage.setItem('theme', body.classList.contains('dark-theme') ? 'dark' : 'light');
        });
    }

    // API Helper
    async function callApi(endpoint, method = 'GET', data = null) {
        const options = {
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (data && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
            options.body = JSON.stringify(data);
        }
        try {
            const response = await fetch(endpoint, options);
            return {
                ok: response.ok,
                status: response.status,
                data: await response.json().catch(() => null)
            };
        } catch (error) {
            console.error(`Network or API call failed (${endpoint}):`, error);
            alert(`Network error or API call failed for ${endpoint}. See console for details.`);
            return null;
        }
    }

    // --- Modal Logic (Change PIN & Future Modals) ---
    function setupModal(modalId, openBtnId, closeBtnSelector) {
        const modal = document.getElementById(modalId);
        const openBtn = document.getElementById(openBtnId);
        const closeBtn = modal ? modal.querySelector(closeBtnSelector) : null;

        if (!modal || !openBtn || !closeBtn) return;

        openBtn.addEventListener('click', () => {
            modal.style.display = 'block';
        });
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        window.addEventListener('click', (event) => {
            if (event.target == modal) {
                modal.style.display = 'none';
            }
        });
    }
    
    // Setup for Change PIN Modal
    setupModal('change-pin-modal', 'change-pin-btn', '.close-btn');

    // --- Form Submission Logic ---
    // Change PIN Form
    const changePinForm = document.getElementById('change-pin-form');
    if (changePinForm) {
        changePinForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            const pinStatusMsg = document.getElementById('pin-change-status');
            pinStatusMsg.textContent = 'Updating...';
            pinStatusMsg.style.color = 'inherit';

            const currentPin = document.getElementById('current-pin').value;
            const newPin1 = document.getElementById('new-pin1').value;
            const newPin2 = document.getElementById('new-pin2').value;

            if (!/^\d{5}$/.test(currentPin) || !/^\d{5}$/.test(newPin1)) {
                pinStatusMsg.textContent = 'Error: All PINs must be 5 numerical digits.';
                pinStatusMsg.style.color = 'red';
                return;
            }
            if (newPin1 !== newPin2) {
                pinStatusMsg.textContent = 'Error: New PINs do not match.';
                pinStatusMsg.style.color = 'red';
                return;
            }

            const result = await callApi('/api/change_pin', 'POST', { current_pin: currentPin, new_pin: newPin1 });

            if (result && result.ok) {
                pinStatusMsg.textContent = result.data.message || 'Success!';
                pinStatusMsg.style.color = 'green';
                setTimeout(() => { document.getElementById('change-pin-modal').style.display = 'none'; }, 2000);
            } else {
                pinStatusMsg.textContent = `Error: ${result.data.error || 'An unknown error occurred.'}`;
                pinStatusMsg.style.color = 'red';
            }
        });
    }

    // Viewer Theme Form
    const themeForm = document.getElementById('theme-settings-form');
    if (themeForm) {
        const bgColorInput = document.getElementById('background-color');
        const fontColorInput = document.getElementById('font-color');
        const lowTimeInput = document.getElementById('low-time-minutes');
        const warningEnableInput = document.getElementById('low-time-warning-enable');

        async function loadCurrentTheme() {
            const response = await callApi('/api/theme');
            if (response && response.ok && response.data) {
                const themeData = response.data;
                bgColorInput.value = themeData.background || '#000000';
                fontColorInput.value = themeData.font_color || '#FFFFFF';
                lowTimeInput.value = themeData.low_time_minutes || 5;
                warningEnableInput.checked = themeData.warning_enabled !== false;
            }
        }
        loadCurrentTheme();

        themeForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            const newTheme = {
                background: bgColorInput.value,
                font_color: fontColorInput.value,
                low_time_minutes: parseInt(lowTimeInput.value, 10),
                warning_enabled: warningEnableInput.checked
            };
            const result = await callApi('/api/theme', 'POST', newTheme);
            if (result && result.ok) {
                alert(result.data.message || 'Theme updated successfully!');
            } else {
                alert('Failed to update theme.');
            }
        });
    }

    // --- Explicit Timer and Logo Control Logic ---
    document.querySelectorAll('.timer-control-section').forEach(section => {
        const timerId = section.id.split('-')[1];

        const enableToggle = section.querySelector(`#enable-timer-${timerId}`);
        const setTimeBtn = section.querySelector('.set-time');
        const startBtn = section.querySelector('.start');
        const pauseBtn = section.querySelector('.pause');
        const resumeBtn = section.querySelector('.resume');
        const resetBtn = section.querySelector('.reset');
        const logoSelect = section.querySelector(`#logo-select-${timerId}`);
        const clearLogoBtn = section.querySelector('.remove-logo');

        if (enableToggle) {
            enableToggle.addEventListener('change', async function() {
                await callApi(`/api/control_timer/${timerId}`, 'POST', { action: 'toggle_enable', enabled: this.checked });
                fetchAndUpdateAdminTimerDisplays();
            });
        }
        if (setTimeBtn) {
            setTimeBtn.addEventListener('click', async () => {
                const payload = { 
                    action: 'set_time',
                    hours: parseInt(section.querySelector(`#hours-${timerId}`).value) || 0,
                    minutes: parseInt(section.querySelector(`#minutes-${timerId}`).value) || 0,
                    seconds: parseInt(section.querySelector(`#seconds-${timerId}`).value) || 0
                };
                await callApi(`/api/control_timer/${timerId}`, 'POST', payload);
                fetchAndUpdateAdminTimerDisplays();
            });
        }
        if (startBtn) startBtn.addEventListener('click', async () => { 
            await callApi(`/api/control_timer/${timerId}`, 'POST', { action: 'start' }); 
            fetchAndUpdateAdminTimerDisplays();
        });
        if (pauseBtn) pauseBtn.addEventListener('click', async () => { 
            await callApi(`/api/control_timer/${timerId}`, 'POST', { action: 'pause' }); 
            fetchAndUpdateAdminTimerDisplays();
        });
        if (resumeBtn) resumeBtn.addEventListener('click', async () => { 
            await callApi(`/api/control_timer/${timerId}`, 'POST', { action: 'resume' }); 
            fetchAndUpdateAdminTimerDisplays();
        });
        if (resetBtn) resetBtn.addEventListener('click', async () => { 
            await callApi(`/api/control_timer/${timerId}`, 'POST', { action: 'reset' }); 
            fetchAndUpdateAdminTimerDisplays();
        });
        if (logoSelect) {
            logoSelect.addEventListener('change', async function() {
                await callApi(`/api/control_timer/${timerId}`, 'POST', { action: 'set_logo', logo_filename: this.value || null });
                fetchAndUpdateAdminTimerDisplays();
            });
        }
        if (clearLogoBtn) {
            clearLogoBtn.addEventListener('click', async () => {
                await callApi(`/api/control_timer/${timerId}`, 'POST', { action: 'set_logo', logo_filename: null });
                if(logoSelect) logoSelect.value = "";
                fetchAndUpdateAdminTimerDisplays();
            });
        }
    });

    // --- Logo Upload and List Rendering ---
    const uploadLogoForm = document.getElementById('upload-logo-form');
    if (uploadLogoForm) {
        uploadLogoForm.addEventListener('submit', async function (event) {
            event.preventDefault();
            const formData = new FormData(this);
            try {
                const response = await fetch('/api/upload_logo', { method: 'POST', body: formData });
                const result = await response.json();
                if (response.ok) {
                    alert(result.message || 'Logo uploaded!');
                    this.reset();
                    loadLogos(); 
                } else {
                    alert(`Error: ${result.error || 'Upload failed'}`);
                }
            } catch (error) {
                console.error('Logo upload failed:', error);
                alert('Logo upload failed. See console.');
            }
        });
    }

    function renderLogoList(logos) {
        const logoListUl = document.getElementById('logo-list');
        const logoSelectDropdowns = document.querySelectorAll('select[id^="logo-select-"]');
        if (!logoListUl) return;

        logoListUl.innerHTML = '';
        logos.forEach(logo => {
            const li = document.createElement('li');
            li.dataset.filename = logo.filename;
            li.textContent = `${logo.name} (${logo.filename}) `;
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-logo-btn';
            deleteBtn.dataset.filename = logo.filename;
            deleteBtn.textContent = 'Delete';
            deleteBtn.addEventListener('click', async () => {
                if (confirm(`Are you sure you want to delete logo "${logo.name}"?`)) {
                    const result = await callApi(`/api/delete_logo/${logo.filename}`, 'DELETE');
                    if (result && result.ok) {
                        alert(result.data.message || 'Logo deleted.');
                        loadLogos();
                    } else {
                         alert(`Error: ${result.data ? result.data.error : 'Could not delete logo.'}`);
                    }
                }
            });
            li.appendChild(deleteBtn);
            logoListUl.appendChild(li);
        });

        logoSelectDropdowns.forEach(select => {
            const currentSelectedValue = select.value;
            select.innerHTML = '<option value="">-- No Logo --</option>';
            logos.forEach(logo => {
                const option = document.createElement('option');
                option.value = logo.filename;
                option.textContent = logo.name;
                select.appendChild(option);
            });
            if (logos.some(logo => logo.filename === currentSelectedValue)) {
                select.value = currentSelectedValue;
            }
        });
    }

    async function loadLogos() {
        const response = await callApi('/api/get_logos');
        if (response && response.ok && Array.isArray(response.data)) {
            renderLogoList(response.data);
            fetchAndUpdateAdminTimerDisplays();
        }
    }

    // --- Main Data Fetching and UI Refresh ---
    function formatAdminTime(totalSeconds) {
        if (totalSeconds < 0) totalSeconds = 0;
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`;
    }

    async function fetchAndUpdateAdminTimerDisplays() {
        const response = await callApi('/api/timer_status');
        if (response && response.ok && response.data.timers) {
            const statusData = response.data.timers;
            for (const timerId in statusData) {
                if (statusData.hasOwnProperty(timerId)) {
                    const data = statusData[timerId];
                    const displayEl = document.getElementById(`admin-timer-${timerId}-display`);
                    if (displayEl) {
                        if (data.enabled) {
                            if (data.times_up) {
                                displayEl.textContent = 'TIMES UP';
                                displayEl.style.color = 'red';
                            } else {
                                displayEl.textContent = formatAdminTime(data.time_remaining_seconds);
                                displayEl.style.color = (data.time_remaining_seconds < 300 && data.time_remaining_seconds > 0 && data.is_running) ? 'orange' : '';
                            }
                        } else {
                            displayEl.textContent = 'Disabled';
                            displayEl.style.color = '';
                        }
                    }
                    const enableToggleEl = document.getElementById(`enable-timer-${timerId}`);
                    if (enableToggleEl) enableToggleEl.checked = data.enabled;

                    const logoSelectEl = document.getElementById(`logo-select-${timerId}`);
                    if (logoSelectEl) {
                        logoSelectEl.value = data.logo_filename || "";
                    }
                }
            }
        }
    }
    
    // Initial Loads and Polling
    loadLogos();
    fetchAndUpdateAdminTimerDisplays(); 
    setInterval(fetchAndUpdateAdminTimerDisplays, 2000); 
});
