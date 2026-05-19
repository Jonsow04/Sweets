let catalogoCompleto = [];
let carrito = [];
let ultimaSagaId = null;  // Para guardar el ID de la última transacción Saga

document.addEventListener('DOMContentLoaded', () => {
    const cajero = sessionStorage.getItem('cajeroActual') || 'Admin';
    const userTag = document.getElementById('userTag');
    if (userTag) userTag.textContent = cajero;
    cargarCatalogo();
    
    // Agregar un indicador de estado de sincronización
    agregarIndicadorSincronizacion();
});

// Función para agregar indicador visual de sincronización federada
function agregarIndicadorSincronizacion() {
    const toolbar = document.querySelector('.toolbar') || document.querySelector('.card-header');
    if (toolbar && !document.getElementById('syncIndicator')) {
        const indicator = document.createElement('div');
        indicator.id = 'syncIndicator';
        indicator.className = 'badge bg-secondary ms-2';
        indicator.style.cursor = 'pointer';
        indicator.title = 'Estado de sincronización con servidor remoto';
        indicator.innerHTML = '🔄 Sincronizando...';
        indicator.onclick = () => verificarEstadoSincronizacion();
        toolbar.appendChild(indicator);
        actualizarIndicadorSincronizacion();
    }
}

async function actualizarIndicadorSincronizacion() {
    const indicator = document.getElementById('syncIndicator');
    if (!indicator) return;
    
    try {
        // Verificar si hay operaciones fallidas pendientes
        const resp = await fetch('/api/saga/pendientes');
        if (resp.ok) {
            const pendientes = await resp.json();
            if (pendientes.count > 0) {
                indicator.className = 'badge bg-warning ms-2';
                indicator.innerHTML = `⚠️ ${pendientes.count} sincronización(es) pendiente(s)`;
                return;
            }
        }
        indicator.className = 'badge bg-success ms-2';
        indicator.innerHTML = '✅ Sincronizado con servidor remoto';
    } catch (err) {
        indicator.className = 'badge bg-secondary ms-2';
        indicator.innerHTML = '⚠️ Servidor remoto no disponible';
    }
}

async function verificarEstadoSincronizacion() {
    if (!ultimaSagaId) {
        alert('No hay una transacción reciente para verificar');
        return;
    }
    
    try {
        const resp = await fetch(`/api/saga/${ultimaSagaId}`);
        if (!resp.ok) throw new Error('Error al consultar estado');
        
        const estado = await resp.json();
        
        // Contar operaciones por estado
        const completadas = estado.filter(e => e.estado === 'COMPLETADA').length;
        const fallidas = estado.filter(e => e.estado === 'FALLIDA').length;
        const compensadas = estado.filter(e => e.estado === 'COMPENSADA').length;
        
        let mensaje = `📊 Estado de la última transacción (Saga: ${ultimaSagaId.substring(0, 8)}...)\n\n`;
        mensaje += `✅ Completadas: ${completadas}\n`;
        mensaje += `❌ Fallidas: ${fallidas}\n`;
        mensaje += `🔄 Compensadas: ${compensadas}\n\n`;
        
        if (fallidas > 0) {
            mensaje += `⚠️ Hay operaciones fallidas. ¿Desea reintentarlas ahora?`;
            if (confirm(mensaje)) {
                await reintentarOperacionesFallidas();
            }
        } else {
            mensaje += `✨ Todas las operaciones se completaron correctamente.`;
            alert(mensaje);
        }
    } catch (err) {
        alert('Error al consultar estado: ' + err.message);
    }
}

async function reintentarOperacionesFallidas() {
    try {
        const resp = await fetch('/api/retry-failed', { method: 'POST' });
        const resultado = await resp.json();
        
        const exitosos = resultado.filter(r => r.success === true).length;
        const fallidos = resultado.filter(r => r.success === false).length;
        
        alert(`🔄 Reintento completado:\n✅ Exitosos: ${exitosos}\n❌ Fallidos: ${fallidos}\n\n${fallidos > 0 ? 'Los que siguen fallando requieren intervención manual del administrador.' : '¡Todo sincronizado correctamente!'}`);
        
        actualizarIndicadorSincronizacion();
    } catch (err) {
        alert('Error al reintentar: ' + err.message);
    }
}

async function cargarCatalogo(filtro = '') {
    const lista = document.getElementById('listaRapida');
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
        if (filtrados.length === 0) {
            lista.innerHTML = '<p class="text-center text-muted p-3">Sin resultados</p>';
            return;
        }
        lista.innerHTML = filtrados.map(p => `
            <div class="list-item d-flex justify-content-between align-items-center
                        ${p.stock === 0 ? 'opacity-50' : ''}"
                 onclick="${p.stock > 0 ? `agregarAlCarrito(${p.idDulces})` : ''}">
                <div>
                    <div class="fw-semibold">${p.nombre}</div>
                    <small class="text-muted">Stock: ${p.stock}</small>
                </div>
                <div class="text-end">
                    <span class="text-accent fw-bold">$${Number(p.precio).toFixed(2)}</span>
                    ${p.stock === 0 ? '<br><small class="text-danger">Agotado</small>' : ''}
                </div>
            </div>
        `).join('');
        
        // Actualizar el indicador después de cargar el catálogo
        actualizarIndicadorSincronizacion();
        
    } catch (err) {
        lista.innerHTML = '<p class="text-center text-danger p-3">Error al cargar productos</p>';
    }
}

function filtrarInventario() {
    cargarCatalogo(document.getElementById('navSearch').value);
}

function agregarAlCarrito(idDulce) {
    const prod = catalogoCompleto.find(p => p.idDulces === idDulce);
    if (!prod || prod.stock === 0) return;
    const existe = carrito.find(p => p.idDulces === idDulce);
    if (existe) {
        if (existe.cant >= prod.stock) { alert(`Stock máximo: ${prod.stock}`); return; }
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
    if (item.cant <= 0) carrito = carrito.filter(p => p.idDulces !== idDulce);
    else if (prod && item.cant > prod.stock) item.cant = prod.stock;
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
    const tbody = document.querySelector('#tablaVentas tbody');
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
    const total = carrito.reduce((acc, i) => acc + i.precio * i.cant, 0);
    const pago = parseFloat(document.getElementById('inputPago').value) || 0;
    const cambioBox = document.getElementById('cambioBox');
    const cambioDisplay = document.getElementById('cambioDisplay');
    if (pago > 0 && carrito.length > 0) {
        const cambio = pago - total;
        cambioDisplay.textContent = `$${cambio.toFixed(2)}`;
        cambioDisplay.className = cambio >= 0 ? 'fw-bold text-success' : 'fw-bold text-danger';
        cambioBox.style.display = 'flex';
    } else {
        cambioBox.style.display = 'none';
    }
}

async function cobrar() {
    if (carrito.length === 0) { alert('El carrito está vacío'); return; }
    const total = carrito.reduce((acc, i) => acc + i.precio * i.cant, 0);
    const pago = parseFloat(document.getElementById('inputPago').value) || 0;
    if (pago > 0 && pago < total) { alert('El pago es insuficiente'); return; }

    const cajero = sessionStorage.getItem('cajeroActual') || 'Admin';
    const items = carrito.map(i => ({ idDulce: i.idDulces, cantidad: i.cant, precio: i.precio }));

    // Mostrar indicador de carga
    const btnCobrar = event.target;
    const textoOriginal = btnCobrar.innerHTML;
    btnCobrar.disabled = true;
    btnCobrar.innerHTML = '⏳ Procesando...';

    try {
        const resp = await fetch('/api/ventas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items, empleado_nombre: cajero })
        });
        
        if (!resp.ok) { 
            const err = await resp.json(); 
            throw new Error(err.error); 
        }
        
        const data = await resp.json();
        
        // Guardar el saga_id para consultas posteriores
        if (data.saga_id) {
            ultimaSagaId = data.saga_id;
        }
        
        // Mostrar ticket con información de sincronización
        mostrarTicket(data, cajero, pago, data.federated_sync, data.saga_id);
        
        // Actualizar el catálogo local
        for (const item of carrito) {
            const prod = catalogoCompleto.find(p => p.idDulces === item.idDulces);
            if (prod) prod.stock -= item.cant;
        }
        
        // Limpiar carrito y pago
        carrito = [];
        renderCarrito();
        cargarCatalogo();
        document.getElementById('inputPago').value = '';
        
        // Actualizar indicador de sincronización
        actualizarIndicadorSincronizacion();
        
        // Mostrar alerta si la sincronización federada falló
        if (data.federated_sync === false) {
            setTimeout(() => {
                if (confirm('⚠️ La venta se registró localmente, pero la sincronización con el servidor remoto falló.\n\n¿Desea ver el estado y reintentar ahora?')) {
                    verificarEstadoSincronizacion();
                }
            }, 1000);
        }
        
    } catch (err) {
        alert('Error al procesar la venta: ' + err.message);
    } finally {
        btnCobrar.disabled = false;
        btnCobrar.innerHTML = textoOriginal;
    }
}

function mostrarTicket(venta, cajero, pago, federatedSync = true, sagaId = null) {
    const cambio = pago > 0 ? pago - venta.total : 0;
    const fecha = new Date().toLocaleString('es-MX');
    
    const syncStatus = federatedSync ? 
        '<span class="text-success">✓ Sincronizado con servidor remoto</span>' : 
        '<span class="text-warning">⚠️ Pendiente de sincronización remota</span>';
    
    document.getElementById('ticketContenido').innerHTML = `
        <div style="font-family:monospace;font-size:0.85rem">
            <div class="text-center mb-2">
                <strong>🍬 SWEET DREAMS</strong><br>
                <small>${fecha}</small><br>
                <small>Folio: #${venta.idVenta} | Cajero: ${cajero}</small>
                ${sagaId ? `<small class="text-muted">Saga: ${sagaId.substring(0, 12)}...</small>` : ''}
            </div>
            <hr>
            ${carrito.length ? carrito.map(item => `
            <div class="d-flex justify-content-between">
                <span>${item.cant}x ${item.nombre}</span>
                <span>$${(item.precio * item.cant).toFixed(2)}</span>
            </div>
            `).join('') : '<p class="text-center text-muted">Venta registrada</p>'}
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
            <div class="text-center small">
                ${syncStatus}
            </div>
            <hr>
            <div class="text-center"><small>¡Gracias por su compra! 🍬</small></div>
        </div>`;
    
    new bootstrap.Modal(document.getElementById('modalTicket')).show();
}

async function hacerCorte() {
    if (!confirm('¿Realizar corte de caja?')) return;
    try {
        const resp = await fetch('/api/cortes', { method: 'POST' });
        const data = await resp.json();
        
        // Verificar si hay operaciones federadas pendientes antes del corte
        const syncResp = await fetch('/api/saga/pendientes');
        if (syncResp.ok) {
            const pendientes = await syncResp.json();
            if (pendientes.count > 0) {
                if (!confirm(`⚠️ Hay ${pendientes.count} operaciones pendientes de sincronización con el servidor remoto.\n¿Desea continuar con el corte de caja de todas formas?`)) {
                    return;
                }
            }
        }
        
        alert(`✅ Corte realizado\nVentas: ${data.numVentas}\nTotal: $${Number(data.total).toFixed(2)}`);
        actualizarIndicadorSincronizacion();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function cerrarSesion() {
    sessionStorage.clear();
    window.location.href = 'inicio.html';
}

// Función para sincronización manual (puedes agregar un botón en algún lugar)
async function sincronizarManual() {
    if (!confirm('¿Desea forzar la sincronización completa con el servidor remoto?')) return;
    
    try {
        const resp = await fetch('/api/sync/all', { method: 'POST' });
        const resultado = await resp.json();
        
        if (resultado.success) {
            alert(`✅ Sincronización completa iniciada\nSaga ID: ${resultado.saga_id}\nLos resultados se pueden consultar en el log.`);
            actualizarIndicadorSincronizacion();
        } else {
            alert('❌ Error al iniciar sincronización: ' + (resultado.error || 'Error desconocido'));
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// Exponer funciones globales para que funcionen los onclick
window.agregarAlCarrito = agregarAlCarrito;
window.cambiarCantidad = cambiarCantidad;
window.quitarDelCarrito = quitarDelCarrito;
window.limpiarCarrito = limpiarCarrito;
window.cobrar = cobrar;
window.hacerCorte = hacerCorte;
window.cerrarSesion = cerrarSesion;
window.filtrarInventario = filtrarInventario;
window.sincronizarManual = sincronizarManual;
window.verificarEstadoSincronizacion = verificarEstadoSincronizacion;