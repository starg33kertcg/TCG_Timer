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
            // Check content type before parsing
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                return { ok: response.ok, status: response.status, data: await response.json() };
            } else {
                // If not JSON, return text for debugging (likely HTML error page)
                const text = await response.text();
                console.error(`API ${endpoint} returned non-JSON:`, text);
                return { ok: false, status: response.status, error: "Server returned non-JSON response (check console)" };
            }
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
                pinStatusMsg.textContent = `Error: ${result.data ? result.data.error : result.error}`;
                pinStatusMsg.style.color = 'red';
            }
        });
    }

    // Viewer Theme Form
    const themeForm = document.getElementById('theme-settings-form');
    if (themeForm) {
        const bgColorInput = document.getElementById('background-color');
        const fontColorInput = document.getElementById('font-color');
        const lowTimeColorInput = document.getElementById('low-time-color');
        const lowTimeInput = document.getElementById('low-time-minutes');
        const warningEnableInput = document.getElementById('low-time-warning-enable');

        async function loadCurrentTheme() {
            const response = await callApi('/api/theme');
            if (response && response.ok && response.data) {
                const themeData = response.data;
                if(bgColorInput) bgColorInput.value = themeData.background || '#000000';
                if(fontColorInput) fontColorInput.value = themeData.font_color || '#FFFFFF';
                if(lowTimeColorInput) lowTimeColorInput.value = themeData.low_time_color || '#FF0000';
                if(lowTimeInput) lowTimeInput.value = themeData.low_time_minutes || 5;
                if(warningEnableInput) warningEnableInput.checked = themeData.warning_enabled !== false;
            }
        }
        loadCurrentTheme();

        themeForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            const newTheme = {
                background: bgColorInput ? bgColorInput.value : '#000000',
                font_color: fontColorInput ? fontColorInput.value : '#FFFFFF',
                low_time_color: lowTimeColorInput ? lowTimeColorInput.value : '#FF0000',
                low_time_minutes: lowTimeInput ? parseInt(lowTimeInput.value, 10) : 5,
                warning_enabled: warningEnableInput ? warningEnableInput.checked : true
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
                const hInput = section.querySelector(`#hours-${timerId}`);
                const mInput = section.querySelector(`#minutes-${timerId}`);
                const sInput = section.querySelector(`#seconds-${timerId}`);
                const payload = { 
                    action: 'set_time',
                    hours: hInput ? (parseInt(hInput.value) || 0) : 0,
                    minutes: mInput ? (parseInt(mInput.value) || 0) : 0,
                    seconds: sInput ? (parseInt(sInput.value) || 0) : 0
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
                const contentType = response.headers.get("content-type");
                
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    const result = await response.json();
                    if (response.ok) {
                        alert(result.message || 'Logo uploaded!');
                        this.reset();
                        loadLogos(); 
                    } else {
                        alert(`Error: ${result.error || 'Upload failed'}`);
                    }
                } else {
                    const text = await response.text();
                    console.error('Upload API returned non-JSON:', text);
                    alert("Server returned error (check console).");
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

    // --- NEW FEATURE LOGIC: Background and Sounds ---
    
    // Generic Helper for new uploads
    async function handleNewUpload(url, formData) {
        try {
            const res = await fetch(url, { method: 'POST', body: formData });
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                const data = await res.json();
                if (res.ok) return { success: true, data };
                return { success: false, error: data.error };
            } else {
                const text = await res.text();
                console.error(`Upload API ${url} returned non-JSON:`, text);
                return { success: false, error: "Server returned non-JSON (check console)" };
            }
        } catch (e) { return { success: false, error: e.toString() }; }
    }

    // Background Upload
    const bgForm = document.getElementById('upload-background-form');
    if (bgForm) {
        bgForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const res = await handleNewUpload('/api/upload_background', new FormData(this));
            if (res.success) { 
                alert(res.data.message); 
                const nameSpan = document.getElementById('current-bg-name');
                if(nameSpan) nameSpan.textContent = res.data.filename;
                const delBtn = document.getElementById('delete-background-btn');
                if(delBtn) delBtn.style.display = 'inline-block'; 
                this.reset(); 
            } else {
                alert("Error: " + res.error);
            }
        });
    }

    // Delete Buttons (Background & Sounds)
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            let url = '';
            const type = this.getAttribute('data-sound-type');
            
            if (this.id === 'delete-background-btn') {
                url = '/api/delete_background';
            } else if (type) {
                url = `/api/delete_sound/${type}`;
            } else if (this.classList.contains('delete-logo-btn')) {
                 // Handled in renderLogoList logic, skip here to avoid double binding issues or logic conflicts
                 return;
            }
            
            if (url && confirm("Are you sure you want to delete this custom file?")) {
                const res = await callApi(url, 'DELETE');
                if (res && res.ok) { 
                    alert(res.data.message); 
                    location.reload(); 
                } else if (res) {
                    alert("Error: " + res.error);
                }
            }
        });
    });

    // --- Sound Upload and Delete (Restored from Uploaded File) ---
    async function handleSoundUpload(e) {
        e.preventDefault();
        const soundType = this.getAttribute('data-sound-type');
        const formData = new FormData(this);
        
        try {
            // Using the robust handleNewUpload helper logic here manually for clarity/integration
            const res = await handleNewUpload(`/api/upload_sound/${soundType}`, formData);

            if (res.success) {
                alert(res.data.message);
                const nameSpan = document.getElementById(`current-${soundType}-sound`);
                if(nameSpan) nameSpan.textContent = res.data.filename;
                const delBtn = document.getElementById(`delete-${soundType}-sound-btn`);
                if(delBtn) delBtn.style.display = 'inline-block';
                this.reset();
            } else {
                alert(`${soundType.replace('_', ' ').toUpperCase()} Upload Failed: ${res.error}`);
            }
        } catch (error) {
            console.error('Sound upload failed:', error);
            alert('Sound upload failed. See console.');
        }
    }

    async function handleSoundDelete(e) {
        // This function logic is largely redundant with the generic delete-btn listener above,
        // but kept here to match the specific logic flow requested.
        const soundType = this.getAttribute('data-sound-type');
        if (confirm(`Are you sure you want to delete the custom ${soundType.replace('_', ' ')} sound? It will revert to the default tone.`)) {
            const result = await callApi(`/api/delete_sound/${soundType}`, 'DELETE');
            if (result && result.ok) {
                alert(result.data.message);
                const nameSpan = document.getElementById(`current-${soundType}-sound`);
                if(nameSpan) nameSpan.textContent = 'Default Tone';
                const delBtn = document.getElementById(`delete-${soundType}-sound-btn`);
                if(delBtn) delBtn.style.display = 'none';
            } else {
                 alert(`Failed to delete sound: ${result.data ? result.data.error : 'Unknown error.'}`);
            }
        }
    }

    // Explicitly binding these specific handlers to match the uploaded file's structure
    const uploadTimesUpForm = document.getElementById('upload-times-up-sound-form');
    if(uploadTimesUpForm) uploadTimesUpForm.addEventListener('submit', handleSoundUpload);

    const uploadLowTimeForm = document.getElementById('upload-low-time-sound-form');
    if(uploadLowTimeForm) uploadLowTimeForm.addEventListener('submit', handleSoundUpload);

    const deleteTimesUpBtn = document.getElementById('delete-times-up-sound-btn');
    if(deleteTimesUpBtn) {
        // Remove existing listener from generic block if any to prevent double firing, 
        // though safely adding this specific handler is fine as long as logic is idempotent.
        deleteTimesUpBtn.addEventListener('click', handleSoundDelete);
    }

    const deleteLowTimeBtn = document.getElementById('delete-low-time-sound-btn');
    if(deleteLowTimeBtn) {
        deleteLowTimeBtn.addEventListener('click', handleSoundDelete);
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
                        // Only update if not currently focused to avoid annoying UI jumps while selecting
                        if (document.activeElement !== logoSelectEl) {
                             logoSelectEl.value = data.logo_filename || "";
                        }
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
