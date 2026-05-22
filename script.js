// 1. НАЛАШТУВАННЯ SUPABASE
const SUPABASE_URL = 'https://gyvonavbkpprjvtupzzs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5dm9uYXZia3Bwcmp2dHVwenpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MzkyNTMsImV4cCI6MjA5NTAxNTI1M30.AjBy4j5mGXjNOX6BGlVGGtJ5VhnKtKculXEDr7BhyYI';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Стан додатку
let currentUser = null;
let userRoulettes = [];
let currentRouletteId = null;
let rouletteItems = [];
let isSpinning = false;

// DOM елементи Авторизації
const authLoading = document.getElementById('authLoading');
const authForm = document.getElementById('authForm');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const userProfile = document.getElementById('userProfile');
const userEmailDisplay = document.getElementById('userEmailDisplay');
const logoutBtn = document.getElementById('logoutBtn');

// DOM елементи Рулетки
const rouletteSelect = document.getElementById('rouletteSelect');
const createRouletteBtn = document.getElementById('createRouletteBtn');
const spinBtn = document.getElementById('spinBtn');
const winnerDisplay = document.getElementById('winnerDisplay');
const addItemForm = document.getElementById('addItemForm');
const itemTextInput = document.getElementById('itemTextInput');
const itemColorInput = document.getElementById('itemColorInput');
const itemsList = document.getElementById('itemsList');

// DOM елементи для модального вікна профілю
const profileModal = document.getElementById('profileModal');
const openProfileBtn = document.getElementById('openProfileBtn');
const closeProfileBtn = document.getElementById('closeProfileBtn');
const modalEmailDisplay = document.getElementById('modalEmailDisplay');
const changePasswordForm = document.getElementById('changePasswordForm');
const newPasswordInput = document.getElementById('newPassword');

// --- НАЛАШТУВАННЯ МОДАЛЬНОГО ВІКНА АКАУНТА ---

// Функція відкриття модального вікна
openProfileBtn.addEventListener('click', () => {
    if (!currentUser) return;
    modalEmailDisplay.innerText = currentUser.email;
    profileModal.classList.remove('hidden');
});

// Функція закриття модального вікна
closeProfileBtn.addEventListener('click', () => {
    profileModal.classList.add('hidden');
    newPasswordInput.value = '';
});

// Закриття вікна при кліку на темну область навколо нього
profileModal.addEventListener('click', (e) => {
    if (e.target === profileModal) {
        profileModal.classList.add('hidden');
        newPasswordInput.value = '';
    }
});

// Логіка зміни пароля в Supabase
changePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPassword = newPasswordInput.value;

    const { data, error } = await supabaseClient.auth.updateUser({
        password: newPassword
    });

    if (error) {
        alert('Помилка оновлення пароля: ' + error.message);
    } else {
        alert('Пароль успішно оновлено!');
        profileModal.classList.add('hidden');
        newPasswordInput.value = '';
    }
});


// --- БЛОК 1: АВТОРИЗАЦІЯ (КАБІНЕТ) ---

// Перевірка активної сесії користувача при завантаженні сторінки
async function checkUserSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    updateAuthUI(session ? session.user : null);

    // Слідкуємо за змінами стану акаунта (вхід/вихід) в реальному часі
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        updateAuthUI(session ? session.user : null);
    });
}

function updateAuthUI(user) {
    authLoading.classList.add('hidden');
    currentUser = user;

    if (user) {
        authForm.classList.add('hidden');
        userProfile.classList.remove('hidden');
        openProfileBtn.innerText = `👤 ${user.email}`;
        loadUserRoulettes();
    } else {
        userProfile.classList.add('hidden');
        authForm.classList.remove('hidden');
        userRoulettes = [];
        currentRouletteId = null;
        rouletteItems = [];
        updateRouletteSelectUI();
        drawWheel();
        renderItemsList();
    }
}

// Реєстрація нового користувача
registerBtn.addEventListener('click', async () => {
    const email = authEmail.value.trim();
    const password = authPassword.value;
    if (!email || !password) return alert('Заповніть поля!');

    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) alert('Помилка реєстрації: ' + error.message);
    else alert('Успішно! Перевірте пошту для підтвердження або увійдіть (якщо підтвердження вимкнено у Supabase Auth)');
});

// Вхід в акаунт
loginBtn.addEventListener('click', async () => {
    const email = authEmail.value.trim();
    const password = authPassword.value;
    if (!email || !password) return alert('Заповніть поля!');

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) alert('Помилка входу: ' + error.message);
});

// Вихід з акаунта
logoutBtn.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
});


// --- БЛОК 2: КЕРУВАННЯ ДЕКІЛЬКОМА РУЛЕТКАМИ ---

// Завантаження списку рулеток користувача
async function loadUserRoulettes() {
    if (!currentUser) return;

    const { data, error } = await supabaseClient
        .from('roulettes')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Помилка завантаження рулеток:', error.message);
        return;
    }

    userRoulettes = data || [];

    // Якщо у користувача ще немає рулеток, автоматично створюємо першу базову
    if (userRoulettes.length === 0) {
        await createNewRoulette("Моя перша рулетка");
    } else {
        if (!currentRouletteId || !userRoulettes.find(r => r.id === currentRouletteId)) {
            currentRouletteId = userRoulettes[0].id;
        }
        updateRouletteSelectUI();
        loadItemsFromDatabase();
    }
}

// Оновлення списку вибору (select) в інтерфейсі
function updateRouletteSelectUI() {
    rouletteSelect.innerHTML = '';

    if (userRoulettes.length === 0) {
        rouletteSelect.innerHTML = '<option value="">Увійдіть в акаунт</option>';
        return;
    }

    userRoulettes.forEach(r => {
        const option = document.createElement('option');
        option.value = r.id;
        option.innerText = r.title;
        if (r.id === currentRouletteId) option.selected = true;
        rouletteSelect.appendChild(option);
    });
}

// Подія перемикання рулетки в списку
rouletteSelect.addEventListener('change', (e) => {
    currentRouletteId = e.target.value;
    loadItemsFromDatabase();
});

// Кнопка створення нової рулетки
createRouletteBtn.addEventListener('click', async () => {
    if (!currentUser) return alert('Будь ласка, увійдіть в акаунт, щоб створювати рулетки!');
    const name = prompt('Введіть назву для нової рулетки:');
    if (name && name.trim()) {
        await createNewRoulette(name.trim());
    }
    const deleteRouletteBtn = document.getElementById('deleteRouletteBtn');
    if (deleteRouletteBtn) {
        deleteRouletteBtn.addEventListener('click', deleteCurrentRoulette);
    }
}); 

// Функція запису нової рулетки в базу
async function createNewRoulette(title) {
    const { data, error } = await supabaseClient
        .from('roulettes')
        .insert([{ title: title, user_id: currentUser.id }])
        .select();

    if (error) {
        alert('Не вдалося створити рулетку: ' + error.message);
    } else if (data && data.length > 0) {
        currentRouletteId = data[0].id;
        await loadUserRoulettes();
    }
}


// --- БЛОК 3: РОБОТА З СЕКТОРАМИ КОНКРЕТНОЇ РУЛЕТКИ ---

// Завантаження елементів ТІЛЬКИ для вибраної рулетки
async function loadItemsFromDatabase() {
    if (!currentRouletteId) return;

    const { data, error } = await supabaseClient
        .from('roulette_items')
        .select('*')
        .eq('roulette_id', currentRouletteId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Помилка завантаження секторів:', error.message);
        return;
    }

    rouletteItems = data || [];
    drawWheel();
    renderItemsList();
}

// Додавання елемента
addItemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSpinning) return;
    if (!currentRouletteId) return alert('Спершу створіть або оберіть рулетку!');

    const text = itemTextInput.value.trim();
    const color = itemColorInput.value;

    if (text) {
        const { error } = await supabaseClient
            .from('roulette_items')
            .insert([{
                text: text,
                color: color,
                roulette_id: currentRouletteId
            }]);

        if (error) {
            alert('Не вдалося додати елемент: ' + error.message);
        } else {
            itemTextInput.value = '';
            await loadItemsFromDatabase();
        }
    }
});

// Видалення елемента
window.deleteItem = async function (id) {
    if (isSpinning) return;

    const { error } = await supabaseClient
        .from('roulette_items')
        .delete()
        .eq('id', id);

    if (error) {
        alert('Не вдалося видалити елемент: ' + error.message);
    } else {
        await loadItemsFromDatabase();
    }
};


// --- БЛОК 4: АНІМАЦІЯ ТА МАЛЮВАННЯ КОЛЕСА ---

function drawWheel() {
    const canvas = document.getElementById('wheelCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    const displaySize = canvas.clientWidth;
    canvas.width = displaySize;
    canvas.height = displaySize;

    if (rouletteItems.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#e5e7eb';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Додайте сектори', canvas.width / 2, canvas.height / 2);
        return;
    }

    const numSegments = rouletteItems.length;
    const arcAngle = (2 * Math.PI) / numSegments;
    const radius = canvas.width / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    rouletteItems.forEach((item, index) => {
        const startAngle = index * arcAngle;
        ctx.beginPath();
        ctx.fillStyle = item.color;
        ctx.moveTo(radius, radius);
        ctx.arc(radius, radius, radius, startAngle, startAngle + arcAngle);
        ctx.lineTo(radius, radius);
        ctx.fill();

        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.translate(radius, radius);
        ctx.rotate(startAngle + arcAngle / 2);
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(item.text, radius - 20, 5);
        ctx.restore();
    });
}

function renderItemsList() {
    itemsList.innerHTML = '';
    rouletteItems.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'item-row';
        row.innerHTML = `
            <div class="item-info">
                <div class="color-dot" style="background-color: ${item.color}"></div>
                <div class="item-text">${item.text}</div>
            </div>
            <button class="delete-btn" onclick="deleteItem('${item.id}')">Видалити</button>
        `;
        itemsList.appendChild(row);
    });
}

function spinWheel() {
    const canvas = document.getElementById('wheelCanvas');
    if (!canvas || isSpinning || rouletteItems.length === 0) return;

    isSpinning = true;
    spinBtn.disabled = true;
    winnerDisplay.innerText = '';

    let currentRotation = 0;
    const targetRotation = 1800 + Math.random() * 360;
    let speed = 20;

    function animate() {
        currentRotation += speed;
        if (currentRotation > targetRotation * 0.75) speed *= 0.975;

        if (speed < 0.1) {
            isSpinning = false;
            spinBtn.disabled = false;

            const degreesPerSegment = 360 / rouletteItems.length;
            const finalAngle = (360 - (currentRotation % 360)) % 360;
            const correctedAngle = (finalAngle + 270) % 360;
            const winningIndex = Math.floor(correctedAngle / degreesPerSegment);

            const winner = rouletteItems[winningIndex];
            winnerDisplay.innerText = `🎉 Випало: ${winner.text}`;
            return;
        }

        canvas.style.transform = `rotate(${currentRotation}deg)`;
        requestAnimationFrame(animate);
    }
    animate();
}

// Функція видалення поточної вибраної рулетки
async function deleteCurrentRoulette() {
    const rouletteId = rouletteSelect.value;
    if (!rouletteId) return;

    // Отримуємо назву рулетки для підтвердження
    const selectedOption = rouletteSelect.options[rouletteSelect.selectedIndex];
    const rouletteName = selectedOption ? selectedOption.text : "цю рулетку";

    // Запитуємо підтвердження у користувача
    if (!confirm(`Ви впевнені, що хочете видалити рулетку "${rouletteName}" та всі її сектори?`)) {
        return;
    }

    try {
        // Видаляємо рядок із таблиці roulettes в Supabase
        const { error } = await supabaseClient
            .from('roulettes')
            .delete()
            .eq('id', rouletteId);

        if (error) throw error;

        alert('Рулетку успішно видалено!');
        
        // Перезавантажуємо список кімнат з бази, щоб видалена зникла
        await loadUserRoulettes();
        
    } catch (error) {
        console.error('Помилка при видаленні рулетки:', error);
        alert('Не вдалося видалити рулетку: ' + error.message);
    }
}

spinBtn.addEventListener('click', spinWheel);

// СТАРТ ДОДАТКУ
checkUserSession();