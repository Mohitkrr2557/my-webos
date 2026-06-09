// === PART 1: BOOT ENGINE ===
const bootBtn = document.getElementById('boot-btn');
const bootScreen = document.getElementById('boot-screen');
const desktop = document.getElementById('desktop');

bootBtn.addEventListener('click', () => {
    bootScreen.classList.add('hidden');
    desktop.classList.remove('hidden');
    loadNasaPic(); // Pull the NASA image automatically when booting
});

// === PART 2: DIGITAL LIVE SYSTEM CLOCK ===
function updateClock() {
    const now = new Date();
    let hours = now.getHours();
    let minutes = now.getMinutes();
    let seconds = now.getSeconds();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    
    hours = hours % 12;
    hours = hours ? hours : 12; // Change '0' hour to '12'
    minutes = minutes < 10 ? '0' + minutes : minutes;
    seconds = seconds < 10 ? '0' + seconds : seconds;
    
    document.getElementById('clock').innerText = `${hours}:${minutes}:${seconds} ${ampm}`;
}
setInterval(updateClock, 1000);
updateClock();

// === PART 3: WINDOW OPEN/CLOSE MANAGER ===
function toggleWindow(id) {
    const win = document.getElementById(id);
    if (win.classList.contains('hidden')) {
        win.classList.remove('hidden');
        bringToFront(win);
    } else {
        win.classList.add('hidden');
    }
}

// === PART 3: ADVANCED DRAG ENGINE WITH FOCUS INDEXING ===
let highestZ = 10;
function bringToFront(win) {
    highestZ++;
    win.style.zIndex = highestZ;
}

document.querySelectorAll('.window').forEach(win => {
    const header = win.querySelector('.window-header');
    
    win.addEventListener('mousedown', () => bringToFront(win));
    
    header.addEventListener('mousedown', (e) => {
        let offsetX = e.clientX - win.offsetLeft;
        let offsetY = e.clientY - win.offsetTop;
        
        function mouseMoveHandler(e) {
            win.style.left = (e.clientX - offsetX) + 'px';
            win.style.top = (e.clientY - offsetY) + 'px';
        }
        
        function mouseUpHandler() {
            document.removeEventListener('mousemove', mouseMoveHandler);
            document.removeEventListener('mouseup', mouseUpHandler);
        }
        
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
    });
});

// === PART 5 / SUBMISSION REQUIREMENT: CUSTOM NASA API FEATURE ===
function loadNasaPic() {
    const nasaBox = document.querySelector('.nasa-box p');
    const nasaImg = document.getElementById('nasa-img');
    
    // Fetching directly from NASA API
    fetch('https://nasa.gov')
        .then(response => response.json())
        .then(data => {
            if(data.url) {
                nasaImg.src = data.url;
                nasaImg.style.display = 'block';
                nasaBox.innerText = data.title;
            }
        })
        .catch(err => {
            nasaBox.innerText = "Error tracking NASA satellites!";
            console.error(err);
        });
}
