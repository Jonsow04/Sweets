function setUser(name) {
    document.getElementById('usuario').value = name;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    event.target.classList.add('active');
}

function login() {
    const user = document.getElementById('usuario').value;
    const pass = document.getElementById('password').value;

    if (user && pass) { //  cualquier usuario y contraseña son validos, nos vnadara a punto de vetna
        window.location.href = 'punto_venta.html';
    } else {
        alert("Por favor completa los campos");
    }
}