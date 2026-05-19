const ROL = sessionStorage.getItem('cajeroRol') || 'cajero';
const nombre = sessionStorage.getItem('cajeroActual') || 'Usuario';
let todasLasVentas = [];

document.addEventListener('DOMContentLoaded', async() => {

    const userTag = document.getElementById('userTag');
    const badge = document.getElementById('badgeRol');

    if (userTag) userTag.textContent = nombre;

    if (badge) {
        badge.textContent = ROL === 'admin' ?
            '👑 Admin' :
            '🧑‍💼 Cajero';
        badge.style.background =
            ROL === 'admin' ?
            '#c2185b' :
            '#607d8b';
    }
    if (ROL === 'admin') {
        const filtroAdmin = document.getElementById('filtroAdmin');
        if (filtroAdmin) {
            filtroAdmin.classList.remove('d-none');
        }
        const sub = document.getElementById('subtituloHistorial');
        if (sub) {
            sub.textContent = 'Todas las ventas registradas';
        }
        await cargarTodo();
    } else {
        const titulo = document.getElementById('tituloHistorial');
        const sub = document.getElementById('subtituloHistorial');
        if (titulo) {
            titulo.textContent = '🕒 Mis Ventas de Hoy';
        }
        if (sub) {
            sub.textContent = 'Ventas del día actual';
        }
        await cargarHoy();
    }
});

async function cargarTodo() {
    const contenedor = document.getElementById('contenedorHistorial');
    contenedor.innerHTML = '<p class="text-muted text-center">Cargando...</p>';
    try {
        const resp = await fetch('/api/ventas');
        todasLasVentas = await resp.json();
        renderHistorial();
    } catch (err) {
        contenedor.innerHTML = '<p class="text-danger text-center">❌ Error al cargar ventas</p>';
        console.error(err);
    }
}

async function cargarHoy() {
    const contenedor = document.getElementById('contenedorHistorial');
    contenedor.innerHTML = '<p class="text-muted text-center">Cargando...</p>';
    try {
        const resp = await fetch('/api/ventas/hoy');
        todasLasVentas = await resp.json();
        renderHistorial();
    } catch (err) {
        contenedor.innerHTML = '<p class="text-danger text-center">❌ Error al cargar ventas</p>';
        console.error(err);
    }
}

function renderHistorial() {
    const filtroEl = document.getElementById('filtroFecha');
    const filtro = filtroEl ? filtroEl.value : '';

    const ventas = filtro ?
        todasLasVentas.filter(v => v.fecha && String(v.fecha).startsWith(filtro)) :
        todasLasVentas;

    const totalIngresos = ventas.reduce((a, v) => a + Number(v.total), 0);

    const statsRow = document.getElementById('statsRow');
    if (statsRow) {
        statsRow.innerHTML = `
            <div class="col-md-4">
                <div class="card text-center shadow-sm border-0" style="background:#fce4ec">
                    <div class="card-body">
                        <h4 class="fw-bold" style="color:#e91e8c">${ventas.length}</h4>
                        <small class="text-muted">Ventas</small>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card text-center shadow-sm border-0" style="background:#f3e5f5">
                    <div class="card-body">
                        <h4 class="fw-bold" style="color:#e91e8c">$${totalIngresos.toFixed(2)}</h4>
                        <small class="text-muted">Total recaudado</small>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card text-center shadow-sm border-0" style="background:#e8f5e9">
                    <div class="card-body">
                        <h4 class="fw-bold text-success">
                            $${ventas.length ? (totalIngresos / ventas.length).toFixed(2) : '0.00'}
                        </h4>
                        <small class="text-muted">Promedio por venta</small>
                    </div>
                </div>
            </div>`;
    }

    const contenedor = document.getElementById('contenedorHistorial');
    if (!ventas.length) {
        contenedor.innerHTML = `
            <div class="text-center p-5">
                <p class="text-muted">No hay ventas registradas.</p>
            </div>`;
        return;
    }

    contenedor.innerHTML = ventas.map(v => {
        const fecha = v.fecha ? new Date(v.fecha).toLocaleDateString('es-MX') : '—';
        const cajero = v.empleado_nombre || 'Admin';
        const detalle = v.items && v.items.length ?
            v.items.map(i => `${i.cantidad}x ${i.dulce_nombre}`).join(', ') :
            '—';
        return `
            <div class="list-group-item mb-3 shadow-sm border-start border-danger border-4 rounded">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <h6 class="mb-1 fw-bold">Venta #${v.idVenta}</h6>
                        <small class="text-muted">${fecha}</small>
                    </div>
                    <div class="text-end">
                        <span class="badge bg-success fs-6">$${Number(v.total).toFixed(2)}</span><br>
                        <small class="text-muted">Atendió: ${cajero}</small>
                    </div>
                </div>
                <hr class="my-2">
                <small class="text-secondary"><strong>Detalle:</strong> ${detalle}</small>
            </div>`;
    }).join('');
}