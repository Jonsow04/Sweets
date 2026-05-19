function setUsuario(email, el) {
    document.getElementById('email').value = email;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('password').focus();
}

async function login() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const errorMsg = document.getElementById('errorMsg');
    const btn = document.getElementById('btnLogin');

    errorMsg.classList.add('d-none');

    if (!email || !password) {
        errorMsg.textContent = 'Completa todos los campos';
        errorMsg.classList.remove('d-none');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Verificando...';

    try {
        const resp = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email,
                password
            })
        });
        const data = await resp.json();

        if (data.ok) {
            sessionStorage.setItem('cajeroActual', data.nombre);
            sessionStorage.setItem('cajeroId', String(data.id));
            sessionStorage.setItem('cajeroRol', data.rol);
            sessionStorage.setItem('cajeroPuesto', data.puesto);
            window.location.href = 'punto_venta.html';
        } else {
            errorMsg.textContent = data.mensaje || 'Credenciales incorrectas';
            errorMsg.classList.remove('d-none');
        }
    } catch (err) {
        errorMsg.textContent = '⚠️ No se pudo conectar. ¿Está corriendo node server.js?';
        errorMsg.classList.remove('d-none');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Entrar →';
    }
}