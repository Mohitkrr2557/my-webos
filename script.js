
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
        daySquare.style.border = '1px solid rgba(255, 51, 51, 0.2)';



        
        if (i === now.getDate()) {
            daySquare.style.backgroundColor = '#ff3333';
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




function addTodo() {
    const input = document.getElementById('todo-input');
    const list = document.getElementById('todo-list');
    const text = input.value.trim();

    
    if (!text) return;

    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.gap = '8px';
    item.style.padding = '4px 0';
    item.style.borderBottom = '1px solid rgba(255, 51, 51, 0.2)';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.style.accentColor = '#ff3333';
    cb.onchange = () => {
        label.style.textDecoration = cb.checked ? 'line-through' : 'none';
        label.style.opacity = cb.checked ? '0.5' : '1';
    };

    
    
    
    const label = document.createElement('span');
    label.textContent = text;
    label.style.flexGrow = '1';

    
    const del = document.createElement('button');
    del.textContent = '✕';
    del.style.margin = '0';
    del.style.padding = '2px 6px';
    del.style.fontSize = '0.7rem';
    del.onclick = () => item.remove();

    
    
    item.appendChild(cb);
    item.appendChild(label);
    item.appendChild(del);
    list.appendChild(item);

    input.value = '';
    input.focus();
}

document.getElementById('todo-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTodo();
});
