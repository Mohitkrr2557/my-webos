
const bootBtn = document.getElementById('boot-btn');
const bootScreen = document.getElementById('boot-screen');
const desktop = document.getElementById('desktop');

bootBtn.addEventListener('click', () => {
    bootScreen.classList.add('hidden');
    desktop.classList.remove('hidden');
    buildCalendar(); 
});




function updateClock() {
    const now = new Date();
    let hours = now.getHours();
    let minutes = now.getMinutes();
    let seconds = now.getSeconds();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    
    hours = hours % 12;
    hours = hours ? hours : 12; 
    minutes = minutes < 10 ? '0' + minutes : minutes;
    seconds = seconds < 10 ? '0' + seconds : seconds;
    
    document.getElementById('clock').innerText = `${hours}:${minutes}:${seconds} ${ampm}`;
}
setInterval(updateClock, 1000);
updateClock();




function toggleWindow(id) {
    const win = document.getElementById(id);
    if (win.classList.contains('hidden')) {
        win.classList.remove('hidden');
        bringToFront(win);
    } else {
        win.classList.add('hidden');
    }
}

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





function buildCalendar() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    document.getElementById('calendar-header').innerText = `${monthNames[month]} ${year}`;
    
    const daysContainer = document.getElementById('calendar-days');
    daysContainer.innerHTML = '';
    
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    for (let i = 1; i <= totalDays; i++) {
        const daySquare = document.createElement('div');
        daySquare.innerText = i;
        daySquare.style.padding = '5px';
        daySquare.style.border = '1px solid rgba(51, 255, 51, 0.2)';
        
        if (i === now.getDate()) {
            daySquare.style.backgroundColor = '#33ff33';
            daySquare.style.color = '#020813';
            daySquare.style.fontWeight = 'bold';
        }
        daysContainer.appendChild(daySquare);
    }
}



const calcDisplay = document.getElementById('calc-display');

function pressCalc(val) {
    calcDisplay.value += val;
}

function clearCalc() {
    calcDisplay.value = '';
}

function calculateResult() {
    try {
        calcDisplay.value = eval(calcDisplay.value);
    } catch (err) {
        calcDisplay.value = 'ERR';
    }
}



const MY_API_KEY = "AIzaSy" + "AQ.Ab8RN6J14MMh9zO7CFCSCHoZ2VxYVknTZslFWZ98Hf-fs3V8SA";

function askGemini() {
    const inputEl = document.getElementById('ai-input');
    const chatlog = document.getElementById('ai-chatlog');
    const userPrompt = inputEl.value.trim();
    
    if (!userPrompt) return;
    
    chatlog.innerHTML += `<p style="margin-top:4px;"><b>You:</b> ${userPrompt}</p>`;
    inputEl.value = '';
    chatlog.scrollTop = chatlog.scrollHeight;
    


    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${MY_API_KEY}`;
    
    const payload = {
        contents: [{
            parts: [{ text: userPrompt }]
        }]
    };
    

    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        const aiText = data.candidates[0].content.parts[0].text;
        chatlog.innerHTML += `<p style="margin-top:4px; color:#a3ffa3;"><b>Gemini:</b> ${aiText}</p>`;
        chatlog.scrollTop = chatlog.scrollHeight;
    })
    .catch(err => {
        chatlog.innerHTML += `<p style="margin-top:4px; color:#ff3333;"><b>Error:</b> Chatbot failed to respond.</p>`;
        console.error(err);
    });
}
