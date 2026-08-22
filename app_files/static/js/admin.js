document.addEventListener('DOMContentLoaded', function () {
    const themeToggleButton = document.getElementById('theme-toggle');
    const openViewerBtn = document.getElementById('open-viewer-btn');
    const body = document.body;

    const currentTheme = localStorage.getItem('theme');
    if (currentTheme === 'dark') body.classList.add('dark-theme');
    if (themeToggleButton) {
        themeToggleButton.addEventListener('click', () => {
            body.classList.toggle('dark-theme');
            localStorage.setItem('theme', body.classList.contains('dark-theme') ? 'dark' : 'light');
        });
    }

    if (openViewerBtn) {
        openViewerBtn.addEventListener('click', () => {
            if (window.electronAPI) window.electronAPI.openViewer();
            else alert('This feature is only available in the desktop app.');
        });
    }

    async function callApi(endpoint, method = 'GET', data = null) {
        const options = { method: method, headers: { 'Content-Type': 'application/json' } };
        if (data && (method === 'POST' || method === 'PUT' || method === 'DELETE')) options.body = JSON.stringify(data);
        try {
            const response = await fetch(endpoint, options);
            return { ok: response.ok, status: response.status, data: await response.json().catch(() => null) };
        } catch (error) {
            console.error(`Network or API call failed (${endpoint}):`, error);
            alert(`Network error: ${endpoint}`);
            return null;
        }
    }

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
                bgColorInput.value = themeData.background || '#000000';
                fontColorInput.value = themeData.font_color || '#FFFFFF';
                if(lowTimeColorInput) lowTimeColorInput.value = themeData.low_time_color || '#FF0000'; 
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
                low_time_color: lowTimeColorInput.value, 
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
                const display = document.getElementById(`admin-timer-${timerId}-display`).textContent;
                if (this.checked && (display === '00h00m00s' || display === '00:00:00')) {
                    alert("Please set a time greater than 0 before enabling this timer.");
                    this.checked = false;
                    return;
                }
                
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
        if (startBtn) startBtn.addEventListener('click', async () => { await callApi(`/api/control_timer/${timerId}`, 'POST', { action: 'start' }); fetchAndUpdateAdminTimerDisplays(); });
        if (pauseBtn) pauseBtn.addEventListener('click', async () => { await callApi(`/api/control_timer/${timerId}`, 'POST', { action: 'pause' }); fetchAndUpdateAdminTimerDisplays(); });
        if (resumeBtn) resumeBtn.addEventListener('click', async () => { await callApi(`/api/control_timer/${timerId}`, 'POST', { action: 'resume' }); fetchAndUpdateAdminTimerDisplays(); });
        if (resetBtn) resetBtn.addEventListener('click', async () => { await callApi(`/api/control_timer/${timerId}`, 'POST', { action: 'reset' }); fetchAndUpdateAdminTimerDisplays(); });
        if (logoSelect) {
            logoSelect.addEventListener('change', async function() { await callApi(`/api/control_timer/${timerId}`, 'POST', { action: 'set_logo', logo_filename: this.value || null }); fetchAndUpdateAdminTimerDisplays(); });
        }
        if (clearLogoBtn) {
            clearLogoBtn.addEventListener('click', async () => { await callApi(`/api/control_timer/${timerId}`, 'POST', { action: 'set_logo', logo_filename: null }); if(logoSelect) logoSelect.value = ""; fetchAndUpdateAdminTimerDisplays(); });
        }
    });

    const uploadLogoForm = document.getElementById('upload-logo-form');
    if (uploadLogoForm) {
        uploadLogoForm.addEventListener('submit', async function (event) {
            event.preventDefault();
            const formData = new FormData(this);
            try {
                const response = await fetch('/api/upload_logo', { method: 'POST', body: formData });
                const result = await response.json();
                if (response.ok) { alert(result.message || 'Logo uploaded!'); this.reset(); loadLogos(); } 
                else { alert(`Error: ${result.error || 'Upload failed'}`); }
            } catch (error) { console.error('Logo upload failed:', error); alert('Logo upload failed. See console.'); }
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
            deleteBtn.className = 'delete-logo-btn btn-danger btn-small'; deleteBtn.dataset.filename = logo.filename; deleteBtn.textContent = 'Delete';
            deleteBtn.addEventListener('click', async () => {
                if (confirm(`Are you sure you want to delete logo "${logo.name}"?`)) {
                    const result = await callApi(`/api/delete_logo/${logo.filename}`, 'DELETE');
                    if (result && result.ok) { alert(result.data.message || 'Logo deleted.'); loadLogos(); }
                    else { alert(`Error: ${result.data ? result.data.error : 'Could not delete logo.'}`); }
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
            if (logos.some(logo => logo.filename === currentSelectedValue)) select.value = currentSelectedValue;
        });
    }

    async function loadLogos() {
        const response = await callApi('/api/get_logos');
        if (response && response.ok && Array.isArray(response.data)) { renderLogoList(response.data); fetchAndUpdateAdminTimerDisplays(); }
    }

    async function handleNewUpload(url, formData) {
        try {
            const res = await fetch(url, { method: 'POST', body: formData });
            const data = await res.json();
            if (res.ok) return { success: true, data };
            return { success: false, error: data.error };
        } catch (e) { return { success: false, error: e.toString() }; }
    }

    const bgForm = document.getElementById('upload-background-form');
    if (bgForm) {
        bgForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const res = await handleNewUpload('/api/upload_background', new FormData(this));
            if (res.success) { alert(res.data.message); document.getElementById('current-bg-name').textContent = res.data.filename; document.getElementById('delete-background-btn').style.display = 'inline-block'; this.reset(); }
            else alert("Error: " + res.error);
        });
    }

    document.querySelectorAll('.upload-form').forEach(form => {
        const type = form.getAttribute('data-sound-type');
        if (!type) return; 
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            const res = await handleNewUpload(`/api/upload_sound/${type}`, new FormData(this));
            if (res.success) { alert(res.data.message); document.getElementById(`current-${type}-sound`).textContent = res.data.filename; document.getElementById(`delete-${type}-sound-btn`).style.display = 'inline-block'; this.reset(); }
            else alert("Error: " + res.error);
        });
    });
    
    function setupDeleteButton(btnId, apiRoute, successMsg) {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('click', async function() {
                if (confirm('Are you sure you want to delete this custom file?')) {
                    const res = await fetch(apiRoute, { method: 'DELETE' });
                    const data = await res.json();
                    if (res.ok) { alert(data.message || successMsg); location.reload(); }
                    else alert("Error: " + data.error);
                }
            });
        }
    }

    setupDeleteButton('delete-background-btn', '/api/delete_background', 'Background removed.');
    setupDeleteButton('delete-promo-btn', '/api/delete_promo', 'Promo removed.');
    setupDeleteButton('delete-times-up-sound-btn', '/api/delete_times_up_sound', 'Sound removed.');
    setupDeleteButton('delete-low-time-sound-btn', '/api/delete_low_time_sound', 'Sound removed.');


    // --- PROMO & SIGNAGE LOGIC ---
    const promoForm = document.getElementById('upload-promo-form');
    if (promoForm) {
        promoForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const res = await handleNewUpload('/api/upload_promo', new FormData(this));
            if (res.success) { 
                alert(res.data.message); 
                document.getElementById('current-promo-name').textContent = res.data.filename; 
                document.getElementById('delete-promo-btn').style.display = 'inline-block'; 
                this.reset(); 
            } else alert("Error: " + res.error);
        });
    }

    const signageToggle = document.getElementById('toggle-signage-global');
    if (signageToggle) {
        signageToggle.addEventListener('change', function() {
            callApi('/api/signage', 'POST', { enabled: this.checked });
        });
    }

    const saveIntervalBtn = document.getElementById('save-signage-settings');
    if (saveIntervalBtn) {
        saveIntervalBtn.addEventListener('click', async () => {
            const val = document.getElementById('signage-interval').value;
            const result = await callApi('/api/signage', 'POST', { interval_seconds: val });
            if (result.ok) alert(result.data.message);
        });
    }

    const signageForm = document.getElementById('upload-signage-form');
    if (signageForm) {
        signageForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const res = await handleNewUpload('/api/upload_signage', new FormData(this));
            if (res.success) { alert(res.data.message); location.reload(); }
            else alert("Error: " + res.error);
        });
    }

    document.querySelectorAll('.delete-signage-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            if (confirm('Remove image from slideshow?')) {
                const res = await fetch(`/api/delete_signage/${this.dataset.filename}`, { method: 'DELETE' });
                if (res.ok) location.reload();
            }
        });
    });

    // --- REORDER SIGNAGE LOGIC ---
    document.querySelectorAll('.move-up-btn, .move-down-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const index = parseInt(this.dataset.index);
            const direction = this.classList.contains('move-up-btn') ? 'up' : 'down';
            
            const result = await callApi('/api/reorder_signage', 'POST', { index: index, direction: direction });
            if (result && result.ok) {
                location.reload();
            }
        });
    });

    // --- ADMIN TIME FORMATTING & FETCHING ---
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
    
    loadLogos();
    fetchAndUpdateAdminTimerDisplays(); 
    setInterval(fetchAndUpdateAdminTimerDisplays, 2000); 
    
    // --- PIN Management ---
    const changePinBtn = document.getElementById('change-pin-btn');
    const changePinModal = document.getElementById('change-pin-modal');
    const closeBtn = document.querySelector('.close-btn');
    const changePinForm = document.getElementById('change-pin-form');
    const pinChangeStatus = document.getElementById('pin-change-status');

    if (changePinBtn && changePinModal) {
        changePinBtn.addEventListener('click', () => { changePinModal.style.display = "block"; pinChangeStatus.textContent = ''; });
        closeBtn.addEventListener('click', () => { changePinModal.style.display = "none"; });
        window.addEventListener('click', (event) => { if (event.target == changePinModal) { changePinModal.style.display = "none"; }});

        changePinForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            const currentPin = document.getElementById('current-pin').value;
            const newPin1 = document.getElementById('new-pin1').value;
            const newPin2 = document.getElementById('new-pin2').value;

            if (newPin1 !== newPin2) {
                pinChangeStatus.textContent = "New PINs do not match!";
                pinChangeStatus.style.color = "red";
                return;
            }

            const response = await callApi('/api/change_pin', 'POST', { current_pin: currentPin, new_pin: newPin1 });
            if (response && response.ok) {
                pinChangeStatus.textContent = response.data.message || "PIN changed successfully!";
                pinChangeStatus.style.color = "green";
                setTimeout(() => { changePinModal.style.display = "none"; this.reset(); }, 2000);
            } else {
                pinChangeStatus.textContent = (response && response.data && response.data.error) ? response.data.error : "Failed to change PIN.";
                pinChangeStatus.style.color = "red";
            }
        });
    }
});
