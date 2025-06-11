document.addEventListener('DOMContentLoaded', function () {
    const themeToggleButton = document.getElementById('theme-toggle');
    const body = document.body;

    // Theme preference
    const currentTheme = localStorage.getItem('theme');
    if (currentTheme === 'dark') {
        body.classList.add('dark-theme');
    }
    themeToggleButton.addEventListener('click', () => {
        body.classList.toggle('dark-theme');
        localStorage.setItem('theme', body.classList.contains('dark-theme') ? 'dark' : 'light');
    });

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
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `HTTP error ${response.status}` }));
                console.error(`API Error (${endpoint}):`, errorData.error || response.statusText, response);
                alert(`Error: ${errorData.error || response.statusText}`);
                return null;
            }
            if (response.status === 204) return true; // No content for successful delete, e.g.
            return await response.json();
        } catch (error) {
            console.error(`Network or API call failed (${endpoint}):`, error);
            alert(`Network error or API call failed for ${endpoint}. See console for details.`);
            return null;
        }
    }

    // Timer Controls
    document.querySelectorAll('.timer-control-section').forEach(section => {
        const timerId = section.id.split('-')[1];

        // Enable/Disable Toggle
        const enableToggle = section.querySelector(`#enable-timer-${timerId}`);
        if (enableToggle) {
            enableToggle.addEventListener('change', async function() {
                await callApi(`/api/control_timer/${timerId}`, 'POST', {
                    action: 'toggle_enable',
                    enabled: this.checked
                });
                fetchAndUpdateAdminTimerDisplays(); 
            });
        }

        // Set Time
        const setTimeButton = section.querySelector('.set-time');
        if (setTimeButton) {
            setTimeButton.addEventListener('click', async () => {
                const hours = parseInt(section.querySelector(`#hours-${timerId}`).value) || 0;
                const minutes = parseInt(section.querySelector(`#minutes-${timerId}`).value) || 0;
                const seconds = parseInt(section.querySelector(`#seconds-${timerId}`).value) || 0;
                await callApi(`/api/control_timer/${timerId}`, 'POST', {
                    action: 'set_time',
                    hours: hours,
                    minutes: minutes,
                    seconds: seconds
                });
                fetchAndUpdateAdminTimerDisplays();
            });
        }

        // Start, Pause, Resume, Reset
        ['start', 'pause', 'resume', 'reset'].forEach(action => {
            const button = section.querySelector(`button.${action}`);
            if (button) {
                button.addEventListener('click', async () => {
                    await callApi(`/api/control_timer/${timerId}`, 'POST', { action: action });
                    fetchAndUpdateAdminTimerDisplays();
                });
            }
        });

        // --- LOGO ASSIGNMENT ---
        const logoSelect = section.querySelector(`#logo-select-${timerId}`);
        
        if (logoSelect) {
            logoSelect.addEventListener('change', async function() {
                const selectedLogoFilename = this.value;
                console.log(`Timer ${timerId} logo selection changed to: ${selectedLogoFilename || 'None'}`);
                const result = await callApi(`/api/control_timer/${timerId}`, 'POST', {
                    action: 'set_logo',
                    logo_filename: selectedLogoFilename || null // Send null if "-- No Logo --" (empty value) is selected
                });
                if (result) {
                    // UI will be fully updated by the periodic poll, or call it for immediate reflection
                    fetchAndUpdateAdminTimerDisplays();
                }
            });
        }
        
        // "Clear Logo" button listener
        const removeLogoButton = section.querySelector('button.remove-logo');
        if (removeLogoButton) {
            removeLogoButton.addEventListener('click', async () => {
                 await callApi(`/api/control_timer/${timerId}`, 'POST', {
                    action: 'set_logo',
                    logo_filename: null // Explicitly set to null
                });
                if(logoSelect) logoSelect.value = ""; // Visually reset dropdown
                fetchAndUpdateAdminTimerDisplays();
            });
        }
        // --- END LOGO ASSIGNMENT ---
    });

    // Logo Management (Upload and Delete List)
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
        const logoSelectDropdowns = document.querySelectorAll('select[id^="logo-select-"]'); // Get all logo dropdowns
        
        if (logoListUl) logoListUl.innerHTML = ''; 
        
        logos.forEach(logo => {
            if (logoListUl) {
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
                        if (result) {
                            alert(result.message || result.warning || 'Logo deletion processed.');
                            loadLogos(); 
                        }
                    }
                });
                li.appendChild(deleteBtn);
                logoListUl.appendChild(li);
            }
        });

        // Update all timer logo select dropdowns with the new list of logos
        logoSelectDropdowns.forEach(select => {
            const currentSelectedValue = select.value; // Preserve current selection if possible
            select.innerHTML = '<option value="">-- No Logo --</option>'; // Reset options
            logos.forEach(logo => {
                const option = document.createElement('option');
                option.value = logo.filename;
                option.textContent = logo.name;
                select.appendChild(option);
            });
            // Try to re-select the previously selected value if it still exists
            if (logos.some(logo => logo.filename === currentSelectedValue)) {
                select.value = currentSelectedValue;
            } else {
                // If the old selection is gone (e.g. deleted), default to -- No Logo -- or first item
                // The fetchAndUpdateAdminTimerDisplays will later set it to the actual server state.
            }
        });
    }

    async function loadLogos() {
        const logosData = await callApi('/api/get_logos');
        if (logosData) { // Ensure logosData is not null (e.g. from API error)
            renderLogoList(logosData);
            // After rendering the list, we might want to ensure the dropdowns reflect current server state for selected logo
            fetchAndUpdateAdminTimerDisplays(); // This will set the selected value in dropdowns too
        }
    }

    // Admin Timer Display Updates
    let adminTimerStates = {}; 
    function formatAdminTime(totalSeconds) {
        if (totalSeconds < 0) totalSeconds = 0;
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`;
    }

    async function fetchAndUpdateAdminTimerDisplays() {
        const statusData = await callApi('/api/timer_status');
        if (statusData) {
            adminTimerStates = statusData; 
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
    
    // Initial Loads
    loadLogos();
    fetchAndUpdateAdminTimerDisplays(); 
    setInterval(fetchAndUpdateAdminTimerDisplays, 2000); 
});
