// App State
let state = {
    isRunning: false,
    startTime: null,
    currentRun: null,
    runs: [],
    watchId: null,
    positions: [],
    paceData: [],
    lastMinuteMark: null,
    distanceBuffer: [],
    paceBuffer: []
};

// DOM Elements
const elements = {
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    distance: document.getElementById('distance'),
    pace: document.getElementById('pace'),
    speed: document.getElementById('speed'),
    time: document.getElementById('time'),
    map: null,
    trail: null,
    marker: null,
    paceChart: null,
    previousRuns: document.getElementById('previousRuns')
};

// Initialize the app
function init() {
    loadRuns();
    initMap();
    initPaceChart();
    setupEventListeners();
    renderPreviousRuns();
}

// Load runs from localStorage
function loadRuns() {
    const savedRuns = localStorage.getItem('runningAppRuns');
    if (savedRuns) {
        state.runs = JSON.parse(savedRuns);
    }
}

// Save runs to localStorage
function saveRuns() {
    localStorage.setItem('runningAppRuns', JSON.stringify(state.runs));
}

// Initialize Leaflet map
function initMap() {
    elements.map = L.map('map').setView([0, 0], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(elements.map);
}

// Initialize pace chart
function initPaceChart() {
    const ctx = document.createElement('canvas');
    ctx.id = 'paceChartCanvas';
    document.getElementById('paceChart').appendChild(ctx);
    
    elements.paceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Distance per minute (meters)',
                data: [],
                backgroundColor: 'rgba(79, 70, 229, 0.7)',
                borderColor: 'rgba(79, 70, 229, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Meters'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Minute'
                    }
                }
            }
        }
    });
}

// Setup event listeners
function setupEventListeners() {
    elements.startBtn.addEventListener('click', startRun);
    elements.stopBtn.addEventListener('click', stopRun);
    elements.downloadBtn.addEventListener('click', downloadLastRun);
}

// Start a new run
function startRun() {
    if (state.isRunning) return;
    
    state.isRunning = true;
    state.startTime = new Date();
    state.currentRun = {
        id: Date.now(),
        startTime: state.startTime.toISOString(),
        endTime: null,
        positions: [],
        distance: 0,
        duration: 0
    };
    state.positions = [];
    state.paceData = [];
    state.lastMinuteMark = 0;
    state.distanceBuffer = [];
    state.paceBuffer = [];
    
    // Reset UI
    elements.distance.textContent = '0.00 km';
    elements.pace.textContent = '--:-- /km';
    elements.speed.textContent = '0.00 km/h';
    elements.time.textContent = '00:00:00';
    
    // Update button states
    elements.startBtn.disabled = true;
    elements.stopBtn.disabled = false;
    
    // Clear map
    if (elements.trail) elements.map.removeLayer(elements.trail);
    if (elements.marker) elements.map.removeLayer(elements.marker);
    
    // Start tracking position
    state.watchId = navigator.geolocation.watchPosition(
        handlePositionUpdate,
        handlePositionError,
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );
    
    // Start timer
    state.timerInterval = setInterval(updateTimer, 1000);
    
    // Start pace recording
    state.paceInterval = setInterval(recordPaceData, 60000);
}

// Stop the current run
function stopRun() {
    if (!state.isRunning) return;
    
    state.isRunning = false;
    clearInterval(state.timerInterval);
    clearInterval(state.paceInterval);
    navigator.geolocation.clearWatch(state.watchId);
    
    // Finalize the run
    state.currentRun.endTime = new Date().toISOString();
    state.currentRun.duration = (new Date(state.currentRun.endTime) - new Date(state.currentRun.startTime);
    state.currentRun.positions = state.positions;
    state.currentRun.distance = calculateTotalDistance(state.positions);
    state.currentRun.paceData = state.paceData;
    
    // Save the run
    state.runs.unshift(state.currentRun);
    saveRuns();
    renderPreviousRuns();
    
    // Update button states
    elements.startBtn.disabled = false;
    elements.stopBtn.disabled = true;
}

// Handle position updates
function handlePositionUpdate(position) {
    const { latitude, longitude, speed, accuracy } = position.coords;
    
    // Only use positions with good accuracy
    if (accuracy > 30) return;
    
    const timestamp = new Date(position.timestamp);
    const newPosition = { lat: latitude, lng: longitude, speed, timestamp, accuracy };
    
    // Add to positions array
    state.positions.push(newPosition);
    state.currentRun.positions = state.positions;
    
    // Update map
    updateMap(newPosition);
    
    // Update stats
    updateStats();
}

// Handle position errors
function handlePositionError(error) {
    console.error('Geolocation error:', error);
    // You might want to show a user-friendly error message here
}

// Update the map with new position
function updateMap(position) {
    if (state.positions.length === 1) {
        // First position - center map and add marker
        elements.map.setView([position.lat, position.lng], 15);
        elements.marker = L.marker([position.lat, position.lng]).addTo(elements.map);
    } else {
        // Update marker position
        elements.marker.setLatLng([position.lat, position.lng]);
        
        // Update trail
        if (elements.trail) {
            elements.map.removeLayer(elements.trail);
        }
        elements.trail = L.polyline(state.positions.map(p => [p.lat, p.lng]), {
            color: '#4f46e5',
            weight: 4,
            opacity: 0.7
        }).addTo(elements.map);
    }
}

// Update the stats display
function updateStats() {
    if (state.positions.length < 2) return;
    
    // Calculate total distance
    const totalDistance = calculateTotalDistance(state.positions);
    elements.distance.textContent = `${(totalDistance / 1000).toFixed(2)} km`;
    
    // Calculate duration
    const duration = (new Date() - new Date(state.currentRun.startTime)) / 1000; // in seconds
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = Math.floor(duration % 60);
    elements.time.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // Calculate speed (smoothed)
    const recentPositions = state.positions.slice(-5); // Use last 5 positions for smoothing
    let speedSum = 0;
    let validSpeeds = 0;
    
    recentPositions.forEach(pos => {
        if (pos.speed !== null && pos.speed > 0) {
            speedSum += pos.speed;
            validSpeeds++;
        }
    });
    
    const avgSpeed = validSpeeds > 0 ? (speedSum / validSpeeds) * 3.6 : 0; // Convert m/s to km/h
    elements.speed.textContent = `${avgSpeed.toFixed(2)} km/h`;
    
    // Calculate pace (smoothed)
    if (totalDistance > 50) { // Only show pace after some distance
        const pace = duration / (totalDistance / 1000); // seconds per km
        const paceMin = Math.floor(pace / 60);
        const paceSec = Math.floor(pace % 60);
        elements.pace.textContent = `${paceMin}:${paceSec.toString().padStart(2, '0')} /km`;
        
        // Add to buffer for smoothing
        state.paceBuffer.push(pace);
        if (state.paceBuffer.length > 5) {
            state.paceBuffer.shift();
        }
    }
}

// Update the timer display
function updateTimer() {
    if (!state.isRunning) return;
    
    const duration = (new Date() - new Date(state.currentRun.startTime)) / 1000; // in seconds
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = Math.floor(duration % 60);
    elements.time.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Record pace data every minute
function recordPaceData() {
    if (!state.isRunning || state.positions.length < 2) return;
    
    const currentTime = new Date();
    const elapsedMinutes = Math.floor((currentTime - new Date(state.currentRun.startTime)) / 60000);
    
    if (elapsedMinutes > state.lastMinuteMark) {
        // Calculate distance covered in the last minute
        const minuteStart = new Date(currentTime.getTime() - 60000);
        const positionsInMinute = state.positions.filter(p => new Date(p.timestamp) >= minuteStart);
        
        let distanceInMinute = 0;
        if (positionsInMinute.length >= 2) {
            distanceInMinute = calculateTotalDistance(positionsInMinute);
        }
        
        state.paceData.push({
            minute: elapsedMinutes,
            distance: distanceInMinute
        });
        
        state.lastMinuteMark = elapsedMinutes;
        
        // Update chart
        updatePaceChart();
    }
}

// Update the pace chart
function updatePaceChart() {
    const labels = state.paceData.map(data => `Min ${data.minute}`);
    const data = state.paceData.map(data => data.distance);
    
    elements.paceChart.data.labels = labels;
    elements.paceChart.data.datasets[0].data = data;
    elements.paceChart.update();
}

// Calculate total distance from positions array
function calculateTotalDistance(positions) {
    let totalDistance = 0;
    
    for (let i = 1; i < positions.length; i++) {
        totalDistance += calculateDistance(
            positions[i-1].lat, positions[i-1].lng,
            positions[i].lat, positions[i].lng
        );
    }
    
    return totalDistance;
}

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
}

// Render previous runs list
function renderPreviousRuns() {
    if (state.runs.length === 0) {
        elements.previousRuns.innerHTML = '<p class="text-gray-500">No runs recorded yet</p>';
        return;
    }
    
    elements.previousRuns.innerHTML = state.runs.map(run => `
        <div class="border rounded-lg p-4 hover:bg-gray-50 transition">
            <div class="flex justify-between items-center">
                <h3 class="font-medium">${new Date(run.startTime).toLocaleString()}</h3>
                <button class="text-indigo-600 hover:text-indigo-800 run-download" data-id="${run.id}">
                    Download
                </button>
            </div>
            <div class="grid grid-cols-3 gap-2 mt-2 text-sm">
                <div>
                    <span class="text-gray-500">Distance</span>
                    <p>${(run.distance / 1000).toFixed(2)} km</p>
                </div>
                <div>
                    <span class="text-gray-500">Duration</span>
                    <p>${formatDuration(run.duration)}</p>
                </div>
                <div>
                    <span class="text-gray-500">Avg Pace</span>
                    <p>${calculateAveragePace(run.duration, run.distance)}</p>
                </div>
            </div>
        </div>
    `).join('');
    
    // Add event listeners to download buttons
    document.querySelectorAll('.run-download').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const runId = parseInt(e.target.getAttribute('data-id'));
            downloadRun(runId);
        });
    });
}

// Format duration as HH:MM:SS
function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Calculate average pace
function calculateAveragePace(durationMs, distanceMeters) {
    if (distanceMeters === 0) return '--:-- /km';
    
    const paceSecPerKm = (durationMs / 1000) / (distanceMeters / 1000);
    const paceMin = Math.floor(paceSecPerKm / 60);
    const paceSec = Math.floor(paceSecPerKm % 60);
    
    return `${paceMin}:${paceSec.toString().padStart(2, '0')} /km`;
}

// Download the last run as JSON
function downloadLastRun() {
    if (state.runs.length === 0) {
        alert('No runs to download');
        return;
    }
    downloadRun(state.runs[0].id);
}

// Download a specific run as JSON
function downloadRun(runId) {
    const run = state.runs.find(r => r.id === runId);
    if (!run) return;
    
    const dataStr = JSON.stringify(run, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `run-${new Date(run.startTime).toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', init);