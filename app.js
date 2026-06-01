// UTM Campaign Builder - Application Logic
document.addEventListener("DOMContentLoaded", () => {
    
    // State Object
    const state = {
        activeLocation: "national",
        targetUrl: "https://allianzcinema.ch/programm",
        source: null,
        medium: null,
        campaign: null,
        history: JSON.parse(localStorage.getItem("utm_history") || "[]")
    };

    // DOM Elements References
    const locationCards = document.querySelectorAll(".location-card");
    const inputUrlPath = document.getElementById("url-path"); // Points to the fully open URL input
    
    const dropzoneSource = document.getElementById("dropzone-source");
    const dropzoneMedium = document.getElementById("dropzone-medium");
    const dropzoneCampaign = document.getElementById("dropzone-campaign");
    
    const urlOutput = document.getElementById("url-output");
    const parametersPreview = document.getElementById("parameters-preview");
    
    const btnClear = document.getElementById("btn-clear");
    const btnCopy = document.getElementById("btn-copy");
    const btnClearHistory = document.getElementById("btn-clear-history");
    const historyList = document.getElementById("history-list");
    const draggablePills = document.querySelectorAll(".pill[draggable='true']");
    const dropzones = document.querySelectorAll(".dropzone");

    // Initialize Application
    init();

    function init() {
        setupEventListeners();
        renderWorkspace();
        renderHistory();
        generateUTM();
    }

    // Event Listeners Setup
    function setupEventListeners() {
        // Location Card Selector Clicks
        locationCards.forEach(card => {
            card.addEventListener("click", function() {
                selectLocation(this.dataset.location, this.dataset.url);
            });
        });

        // Fully Open URL Input Event
        inputUrlPath.addEventListener("input", function(e) {
            handleUrlInput(e.target.value.trim());
        });

        // HTML5 Drag & Drop Listeners for Pills
        draggablePills.forEach(pill => {
            pill.addEventListener("dragstart", handleDragStart);
            pill.addEventListener("dragend", handleDragEnd);
            
            // Premium Click Fallback: click to snap to dropzone immediately
            pill.addEventListener("click", () => {
                const type = pill.dataset.type;
                const value = pill.dataset.value;
                setSlot(type, value);
            });
        });

        // HTML5 Drag & Drop Listeners for Dropzones
        dropzones.forEach(zone => {
            zone.addEventListener("dragover", handleDragOver);
            zone.addEventListener("dragenter", handleDragEnter);
            zone.addEventListener("dragleave", handleDragLeave);
            zone.addEventListener("drop", handleDrop);
        });

        // Copy Button Click
        btnCopy.addEventListener("click", copyToClipboard);

        // Clear Workspace Button
        btnClear.addEventListener("click", clearWorkspace);

        // Clear History Button
        btnClearHistory.addEventListener("click", clearHistory);
    }

    /* --- LOCATION & PATH LOGIC (PREMIUM UX) --- */

    function selectLocation(locationKey, baseUrl) {
        state.activeLocation = locationKey;
        
        // Try to preserve path from the current input (e.g. "de/journal/eckdaten...")
        let currentUrl = inputUrlPath.value.trim();
        let path = "";
        
        // Domains we want to detect to strip them out
        const domains = [
            "https://zuerich.allianzcinema.ch/",
            "https://basel.allianzcinema.ch/",
            "https://allianzcinema.ch/"
        ];
        
        let pathFound = false;
        for (const dom of domains) {
            if (currentUrl.toLowerCase().startsWith(dom)) {
                path = currentUrl.substring(dom.length);
                pathFound = true;
                break;
            }
        }
        
        // If domain was not matched, try to extract path using URL object
        if (!pathFound && /^https?:\/\//i.test(currentUrl)) {
            try {
                const urlObj = new URL(currentUrl);
                path = urlObj.pathname.substring(1) + urlObj.search + urlObj.hash;
            } catch(e) {
                path = "";
            }
        } else if (!pathFound) {
            path = currentUrl;
        }
        
        // Strip leading slash if any
        if (path.startsWith("/")) {
            path = path.substring(1);
        }
        
        // Build new URL preserving path
        const newUrl = baseUrl + path;
        state.targetUrl = newUrl;
        inputUrlPath.value = newUrl;

        // Visual update on cards
        locationCards.forEach(card => {
            if (card.dataset.location === locationKey) {
                card.classList.add("active");
            } else {
                card.classList.remove("active");
            }
        });
        
        generateUTM();
    }

    // Smart URL Input: Analyze typing/pasting and auto-highlight correct location card
    function handleUrlInput(value) {
        state.targetUrl = value;
        
        let matched = false;
        
        locationCards.forEach(card => {
            const cardUrl = card.dataset.url; // e.g. "https://zuerich.allianzcinema.ch/"
            const cleanCardUrl = cardUrl.replace(/\/$/, ""); // Strip trailing slash for matching
            
            if (value.toLowerCase().startsWith(cleanCardUrl.toLowerCase())) {
                state.activeLocation = card.dataset.location;
                card.classList.add("active");
                matched = true;
            } else {
                card.classList.remove("active");
            }
        });

        // Custom domain mode (deactivate all cards if none match)
        if (!matched) {
            state.activeLocation = null;
            locationCards.forEach(card => card.classList.remove("active"));
        }

        generateUTM();
    }

    /* --- HTML5 DRAG AND DROP HANDLERS --- */

    function handleDragStart(e) {
        this.classList.add("dragging");
        e.dataTransfer.setData("text/plain", JSON.stringify({
            id: this.id,
            value: this.dataset.value,
            type: this.dataset.type
        }));
        e.dataTransfer.effectAllowed = "move";
    }

    function handleDragEnd() {
        this.classList.remove("dragging");
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    }

    function handleDragEnter(e) {
        e.preventDefault();
        const zoneType = this.dataset.type;
        this.classList.add("dragover");
        this.classList.add(`dragover-${zoneType}`);
    }

    function handleDragLeave() {
        const zoneType = this.dataset.type;
        this.classList.remove("dragover");
        this.classList.remove(`dragover-${zoneType}`);
    }

    function handleDrop(e) {
        e.preventDefault();
        const zoneType = this.dataset.type;
        this.classList.remove("dragover");
        this.classList.remove(`dragover-${zoneType}`);
        
        try {
            const data = JSON.parse(e.dataTransfer.getData("text/plain"));
            
            if (data.type === zoneType) {
                setSlot(zoneType, data.value);
            } else {
                showToast(`Bitte ziehe diesen Wert in den passenden '${data.type.toUpperCase()}' Slot.`);
            }
        } catch (err) {
            console.error("Fehler beim Verarbeiten des Drops:", err);
        }
    }

    /* --- STATE MANAGEMENT & RENDERING --- */

    function setSlot(type, value) {
        state[type] = value;
        renderWorkspace();
        generateUTM();
        updateActivePillStates();
    }

    function removeSlot(type) {
        state[type] = null;
        renderWorkspace();
        generateUTM();
        updateActivePillStates();
    }

    function updateActivePillStates() {
        draggablePills.forEach(pill => {
            const type = pill.dataset.type;
            const value = pill.dataset.value;
            if (state[type] === value) {
                pill.style.opacity = "0.4";
                pill.style.pointerEvents = "none";
            } else {
                pill.style.opacity = "1";
                pill.style.pointerEvents = "all";
            }
        });
    }

    function renderWorkspace() {
        renderZone(dropzoneSource, "source");
        renderZone(dropzoneMedium, "medium");
        renderZone(dropzoneCampaign, "campaign");
    }

    function renderZone(zoneElement, type) {
        const value = state[type];
        
        if (value) {
            zoneElement.innerHTML = `
                <div class="pill ${type}-pill">
                    <span>${value}</span>
                    <span class="pill-remove" data-type="${type}">&times;</span>
                </div>
            `;
            
            zoneElement.querySelector(".pill-remove").addEventListener("click", function(e) {
                e.stopPropagation();
                removeSlot(this.dataset.type);
            });
        } else {
            zoneElement.innerHTML = `
                <span class="dropzone-placeholder">Drop ${capitalize(type)} here</span>
            `;
        }
    }

    function clearWorkspace() {
        state.source = null;
        state.medium = null;
        state.campaign = null;
        state.targetUrl = "https://allianzcinema.ch/programm";
        inputUrlPath.value = "https://allianzcinema.ch/programm";
        
        // Reset location card to National
        selectLocation("national", "https://allianzcinema.ch/");
        
        renderWorkspace();
        generateUTM();
        updateActivePillStates();
        showToast("Workspace zurückgesetzt!");
    }

    /* --- UTM GENERATION ENGINE --- */

    function generateUTM() {
        let base = state.targetUrl.trim();
        
        if (!base) {
            urlOutput.textContent = "";
            renderParametersPreview();
            return;
        }

        // Auto-inject https if missing, unless relative
        let cleanBase = base;
        if (!/^https?:\/\//i.test(cleanBase) && !cleanBase.startsWith("#") && !cleanBase.startsWith("/")) {
            cleanBase = "https://" + cleanBase;
        }

        let utmUrl = cleanBase;
        
        try {
            const urlObj = new URL(cleanBase);
            
            if (state.source) urlObj.searchParams.set("utm_source", state.source);
            if (state.medium) urlObj.searchParams.set("utm_medium", state.medium);
            if (state.campaign) urlObj.searchParams.set("utm_campaign", state.campaign);
            
            utmUrl = urlObj.toString();
        } catch (e) {
            // Fallback manual query string joining
            const params = [];
            if (state.source) params.push(`utm_source=${encodeURIComponent(state.source)}`);
            if (state.medium) params.push(`utm_medium=${encodeURIComponent(state.medium)}`);
            if (state.campaign) params.push(`utm_campaign=${encodeURIComponent(state.campaign)}`);
            
            if (params.length > 0) {
                const separator = cleanBase.includes("?") ? "&" : "?";
                utmUrl = cleanBase + separator + params.join("&");
            }
        }

        urlOutput.textContent = utmUrl;
        renderParametersPreview();
    }

    function renderParametersPreview() {
        parametersPreview.innerHTML = "";
        
        if (state.source) {
            parametersPreview.appendChild(createBadge("source", state.source));
        }
        if (state.medium) {
            parametersPreview.appendChild(createBadge("medium", state.medium));
        }
        if (state.campaign) {
            parametersPreview.appendChild(createBadge("campaign", state.campaign));
        }
    }

    function createBadge(type, value) {
        const badge = document.createElement("div");
        badge.className = `param-badge ${type}-badge`;
        badge.innerHTML = `<span class="label">utm_${type}:</span> <span class="value">${value}</span>`;
        return badge;
    }

    /* --- COPY TO CLIPBOARD & HISTORY --- */

    function copyToClipboard() {
        const url = urlOutput.textContent.trim();
        
        if (url === state.targetUrl && !state.source && !state.medium && !state.campaign) {
            showToast("Bitte konfiguriere zuerst mindestens einen UTM Parameter!");
            return;
        }

        navigator.clipboard.writeText(url)
            .then(() => {
                btnCopy.innerHTML = `<span class="btn-icon">✔️</span> Kopiert!`;
                btnCopy.classList.add("copied");
                btnCopy.style.transform = "scale(1.03)";
                
                addToHistory(url);

                setTimeout(() => {
                    btnCopy.innerHTML = `<span class="btn-icon">📋</span> Link kopieren`;
                    btnCopy.classList.remove("copied");
                    btnCopy.style.transform = "none";
                }, 1500);
            })
            .catch(err => {
                console.error("Fehler beim Kopieren:", err);
                showToast("Kopieren fehlgeschlagen. Bitte manuell auswählen.");
            });
    }

    function addToHistory(url) {
        if (state.history.length > 0 && state.history[0].url === url) {
            return;
        }

        const historyItem = {
            id: Date.now(),
            url: url,
            timestamp: new Date().toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }),
            source: state.source,
            medium: state.medium,
            campaign: state.campaign,
            location: state.activeLocation || "custom"
        };

        state.history.unshift(historyItem);
        
        if (state.history.length > 15) {
            state.history.pop();
        }

        localStorage.setItem("utm_history", JSON.stringify(state.history));
        renderHistory();
    }

    function renderHistory() {
        historyList.innerHTML = "";

        if (state.history.length === 0) {
            historyList.innerHTML = `
                <p class="no-history">Noch keine UTM Links generiert. Nutze den Workspace oben, um deinen ersten Link zu erstellen.</p>
            `;
            return;
        }

        state.history.forEach(item => {
            const historyItem = document.createElement("div");
            historyItem.className = "history-item";
            
            // Location label
            let locIcon = "🇨🇭 National";
            if (item.location === "zuerich") locIcon = "⛵ Zürich";
            else if (item.location === "basel") locIcon = "⛪ Basel";
            else if (item.location === "custom") locIcon = "🔗 Custom";

            historyItem.innerHTML = `
                <div class="history-info">
                    <div class="history-url" title="${item.url}">${item.url}</div>
                    <div class="history-meta">
                        <span>🕒 ${item.timestamp}</span>
                        <span>📍 ${locIcon}</span>
                        ${item.source ? `<span>Source: <b>${item.source}</b></span>` : ""}
                        ${item.medium ? `<span>Medium: <b>${item.medium}</b></span>` : ""}
                        ${item.campaign ? `<span>Campaign: <b>${item.campaign}</b></span>` : ""}
                    </div>
                </div>
                <div class="history-actions">
                    <button class="btn-icon-only btn-copy-history" data-url="${item.url}" title="Kopieren">📋</button>
                    <button class="btn-icon-only btn-delete-item" data-id="${item.id}" title="Löschen">🗑️</button>
                </div>
            `;

            historyItem.querySelector(".btn-copy-history").addEventListener("click", function() {
                const targetUrl = this.dataset.url;
                navigator.clipboard.writeText(targetUrl).then(() => {
                    this.textContent = "✔️";
                    setTimeout(() => { this.textContent = "📋"; }, 1000);
                    showToast("Link aus Verlauf kopiert!");
                });
            });

            historyItem.querySelector(".btn-delete-item").addEventListener("click", function() {
                deleteHistoryItem(parseInt(this.dataset.id));
            });

            historyList.appendChild(historyItem);
        });
    }

    function deleteHistoryItem(id) {
        state.history = state.history.filter(item => item.id !== id);
        localStorage.setItem("utm_history", JSON.stringify(state.history));
        renderHistory();
    }

    function clearHistory() {
        if (confirm("Möchtest du den gesamten Verlauf wirklich löschen?")) {
            state.history = [];
            localStorage.setItem("utm_history", "[]");
            renderHistory();
            showToast("Verlauf gelöscht!");
        }
    }

    /* --- HELPERS & TOAST FEEDBACK --- */

    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    function showToast(message) {
        const toast = document.createElement("div");
        toast.className = "toast-message";
        toast.textContent = message;
        
        Object.assign(toast.style, {
            position: "fixed",
            bottom: "20px",
            right: "20px",
            background: "rgba(13, 16, 26, 0.95)",
            color: "white",
            padding: "0.75rem 1.25rem",
            borderRadius: "8px",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
            fontSize: "0.85rem",
            fontWeight: "600",
            backdropFilter: "blur(15px)",
            border: "1px solid rgba(0, 102, 204, 0.3)",
            zIndex: "9999",
            opacity: "0",
            transform: "translateY(10px)",
            transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
        });

        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = "1";
            toast.style.transform = "translateY(0)";
        }, 50);

        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateY(10px)";
            setTimeout(() => toast.remove(), 300);
        }, 2800);
    }
});
