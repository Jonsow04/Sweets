// ─── ESTADO ──────────────────────────────────────────────────────────────────
let catalogoCompleto = [];
let carrito = [];
let ROL = 'cajero';

// INICIO
document.addEventListener('DOMContentLoaded', () => {
    const nombre = sessionStorage.getItem('cajeroActual') || 'Usuario';
    const puesto = sessionStorage.getItem('cajeroPuesto') || '';
    ROL = sessionStorage.getItem('cajeroRol') || 'cajero';

    // Mostrar nombre y puesto
    const userTag = document.getElementById('userTag');
    const puestoTag = document.getElementById('puestoTag');
    if (userTag) userTag.textContent = nombre;
    if (puestoTag) puestoTag.textContent = puesto;

    // Badge de rol
    const badge = document.getElementById('badgeRol');
    if (badge) {
        badge.textContent = ROL === 'admin' ? '👑 Admin' : '💼 Cajero';
        badge.className = ROL === 'admin' ?
            'badge ms-2 me-1 text-white' :
            'badge ms-2 me-1 text-white';
        badge.style.background = ROL === 'admin' ? '#c2185b' : '#607d8b';
    }

    // Mostrar botones según rol
    if (ROL === 'admin') {
        document.querySelectorAll('.solo-admin').forEach(el => el.classList.remove('d-none'));
    }

    cargarCatalogo();
});

// SESION AYUDA
function getHeaders() {
    return {
        'Content-Type': 'application/json',
        'x-user-rol': ROL
    };
}

// CATALAGO DE DULCES
async function cargarCatalogo(filtro = '') {
    const lista = document.getElementById('listaRapida');
    const contador = document.getElementById('contadorProductos');
    if (!lista) return;

    try {
        if (catalogoCompleto.length === 0) {
            lista.innerHTML = '<p class="text-center text-muted p-3">Cargando...</p>';
            const resp = await fetch('/api/dulces');
            catalogoCompleto = await resp.json();
        }

        const filtrados = catalogoCompleto.filter(p =>
            p.nombre.toLowerCase().includes(filtro.toLowerCase()) ||
            String(p.idDulces).includes(filtro)
        );

        if (contador) contador.textContent = `${filtrados.length} productos`;

        if (filtrados.length === 0) {
            lista.innerHTML = '<p class="text-center text-muted p-3">Sin resultados</p>';
            return;
        }

        lista.innerHTML = filtrados.map(p => {
                    const agotado = p.stock === 0;
                    return `
            <div class="list-item d-flex justify-content-between align-items-center ${agotado ? 'opacity-50' : ''}"
                 onclick="${agotado ? '' : `agregarAlCarrito(${p.idDulces})`}"
                 style="cursor:${agotado ? 'not-allowed' : 'pointer'}">
                <div>
                    <div class="fw-semibold">${p.nombre}</div>
                    <small class="text-muted">Stock: ${p.stock}${agotado ? ' — Agotado' : ''}</small>
                </div>
                <div class="text-end">
                    <span style="color:var(--accent)" class="fw-bold">$${Number(p.precio).toFixed(2)}</span>
                </div>
            </div>`;
        }).join('');

    } catch (err) {
        lista.innerHTML = '<p class="text-center text-danger p-3">Error al cargar productos</p>';
        console.error(err);
    }
}

function filtrarInventario() {
    cargarCatalogo(document.getElementById('navSearch').value);
}

//CARRITO
function agregarAlCarrito(idDulce) {
    const prod = catalogoCompleto.find(p => p.idDulces === idDulce);
    if (!prod || prod.stock === 0) return;

    const existe = carrito.find(p => p.idDulces === idDulce);
    if (existe) {
        if (existe.cant >= prod.stock) {
            alert(`Stock máximo disponible: ${prod.stock}`);
            return;
        }
        existe.cant++;
    } else {
        carrito.push({ ...prod, cant: 1 });
    }
    renderCarrito();
}

function cambiarCantidad(idDulce, delta) {
    const item = carrito.find(p => p.idDulces === idDulce);
    const prod = catalogoCompleto.find(p => p.idDulces === idDulce);
    if (!item) return;
    item.cant += delta;
    if (item.cant <= 0) {
        carrito = carrito.filter(p => p.idDulces !== idDulce);
    } else if (prod && item.cant > prod.stock) {
        item.cant = prod.stock;
    }
    renderCarrito();
}

function quitarDelCarrito(idDulce) {
    carrito = carrito.filter(p => p.idDulces !== idDulce);
    renderCarrito();
}

function limpiarCarrito() {
    carrito = [];
    renderCarrito();
}

function renderCarrito() {
    const tbody        = document.querySelector('#tablaVentas tbody');
    const carritoVacio = document.getElementById('carritoVacio');
    const totalDisplay = document.getElementById('totalDisplay');
    if (!tbody) return;

    if (carrito.length === 0) {
        tbody.innerHTML = '';
        if (carritoVacio) carritoVacio.style.display = 'block';
        if (totalDisplay) totalDisplay.textContent = '$0.00';
        document.getElementById('cambioBox').style.display = 'none';
        return;
    }

    if (carritoVacio) carritoVacio.style.display = 'none';

    tbody.innerHTML = carrito.map(item => `
        <tr>
            <td>${item.nombre}</td>
            <td class="text-center">
                <div class="d-flex align-items-center justify-content-center gap-1">
                    <button class="btn btn-sm btn-outline-secondary py-0 px-1"
                            onclick="cambiarCantidad(${item.idDulces}, -1)">−</button>
                    <span class="mx-1">${item.cant}</span>
                    <button class="btn btn-sm btn-outline-secondary py-0 px-1"
                            onclick="cambiarCantidad(${item.idDulces}, 1)">+</button>
                </div>
            </td>
            <td class="text-end">$${Number(item.precio).toFixed(2)}</td>
            <td class="text-end fw-bold">$${(item.precio * item.cant).toFixed(2)}</td>
            <td class="text-center">
                <button class="btn btn-sm btn-outline-danger py-0"
                        onclick="quitarDelCarrito(${item.idDulces})">✕</button>
            </td>
        </tr>
    `).join('');

    const total = carrito.reduce((acc, i) => acc + i.precio * i.cant, 0);
    if (totalDisplay) totalDisplay.textContent = `$${total.toFixed(2)}`;
    calcularCambio();
}

function calcularCambio() {
    const total   = carrito.reduce((acc, i) => acc + i.precio * i.cant, 0);
    const pago    = parseFloat(document.getElementById('inputPago').value) || 0;
    const box     = document.getElementById('cambioBox');
    const display = document.getElementById('cambioDisplay');
    if (pago > 0 && carrito.length > 0) {
        const cambio = pago - total;
        display.textContent = `$${cambio.toFixed(2)}`;
        display.className   = cambio >= 0 ? 'fw-bold text-success' : 'fw-bold text-danger';
        box.style.display   = 'flex';
    } else {
        box.style.display = 'none';
    }
}

// COBRAR
async function cobrar() {
    if (carrito.length === 0) { alert('El carrito está vacío'); return; }

    const total = carrito.reduce((acc, i) => acc + i.precio * i.cant, 0);
    const pago  = parseFloat(document.getElementById('inputPago').value) || 0;

    if (pago > 0 && pago < total) { alert('El pago es insuficiente'); return; }

    const idEmpleado = parseInt(sessionStorage.getItem('cajeroId')) || 1;
    const items = carrito.map(i => ({
        idDulce:  i.idDulces,
        cantidad: i.cant,
        precio:   i.precio
    }));

    try {
        const resp = await fetch('/api/ventas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items, idEmpleado })
        });

        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.error || 'Error al registrar la venta');
        }

        const data = await resp.json();
        mostrarTicket(data, carrito, pago);

        // Actualizar stock en memoria
        for (const item of carrito) {
            const prod = catalogoCompleto.find(p => p.idDulces === item.idDulces);
            if (prod) prod.stock -= item.cant;
        }
        carrito = [];
        renderCarrito();
        cargarCatalogo(); // refrescar lista
        document.getElementById('inputPago').value = '';

    } catch (err) {
        alert('❌ Error: ' + err.message);
        console.error(err);
    }
}

function mostrarTicket(venta, itemsVendidos, pago) {
    const cajero = sessionStorage.getItem('cajeroActual') || 'Admin';
    const cambio = pago > 0 ? pago - venta.total : 0;
    const fecha  = new Date().toLocaleString('es-MX');

    document.getElementById('ticketContenido').innerHTML = `
        <div style="font-family:monospace;font-size:0.85rem">
            <div class="text-center mb-2">
                <strong>🍬 SWEET DREAMS</strong><br>
                <small>${fecha}</small><br>
                <small>Folio #${venta.idVenta} | ${cajero}</small>
            </div>
            <hr>
            ${itemsVendidos.map(i => `
                <div class="d-flex justify-content-between">
                    <span>${i.nombre} x${i.cant}</span>
                    <span>$${(i.precio * i.cant).toFixed(2)}</span>
                </div>`).join('')}
            <hr>
            <div class="d-flex justify-content-between fw-bold">
                <span>TOTAL</span><span>$${Number(venta.total).toFixed(2)}</span>
            </div>
            ${pago > 0 ? `
            <div class="d-flex justify-content-between">
                <span>Pago</span><span>$${pago.toFixed(2)}</span>
            </div>
            <div class="d-flex justify-content-between text-success fw-bold">
                <span>Cambio</span><span>$${cambio.toFixed(2)}</span>
            </div>` : ''}
            <hr>
            <div class="text-center"><small>¡Gracias por su compra! 🍬</small></div>
        </div>`;

    new bootstrap.Modal(document.getElementById('modalTicket')).show();
}

// CORTE
async function hacerCorte() {
    if (!confirm('¿Realizar corte de caja ahora?')) return;
    try {
        const resp = await fetch('/api/cortes', {
            method: 'POST',
            headers: getHeaders()
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error);
        alert(`✅ Corte realizado\nVentas: ${data.numVentas}\nTotal: $${Number(data.total).toFixed(2)}`);
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// SESION
function cerrarSesion() {
    sessionStorage.clear();
    window.location.href = 'inicio.html';
}