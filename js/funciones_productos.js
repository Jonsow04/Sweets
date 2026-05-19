let todosLosProductos = [];
let modalBS = null;

// Esperar a que todo el DOM y Bootstrap estén listos
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar modal DESPUÉS de que el DOM esté listo
    const modalEl = document.getElementById('modalProducto');
    modalBS = new bootstrap.Modal(modalEl, { backdrop: 'static' });

    // El botón guardar llama a la función aquí, sin onclick en HTML
    document.getElementById('btnGuardar').addEventListener('click', guardarProducto);

    listarProductosEdicion();
    cargarTipos();
});

// ── LISTAR ────────────────────────────────────────────────
async function listarProductosEdicion() {
    const contenedor = document.getElementById('listaProductos');
    contenedor.innerHTML = '<p class="text-center text-muted">Cargando...</p>';
    try {
        const resp = await fetch('/api/dulces');
        if (!resp.ok) throw new Error('Error al obtener productos');
        todosLosProductos = await resp.json();
        renderProductos(todosLosProductos);
    } catch (err) {
        contenedor.innerHTML = `<p class="text-danger text-center">❌ ${err.message}</p>`;
    }
}

function filtrarProductos(texto) {
    const filtrados = todosLosProductos.filter(p =>
        p.nombre.toLowerCase().includes(texto.toLowerCase())
    );
    renderProductos(filtrados);
}

function renderProductos(lista) {
    const contenedor = document.getElementById('listaProductos');
    if (!lista.length) {
        contenedor.innerHTML = '<p class="text-muted text-center p-3">No hay productos.</p>';
        return;
    }
    contenedor.innerHTML = lista.map(p => `
        <div class="d-flex justify-content-between align-items-center border p-3 mb-2 bg-white rounded shadow-sm">
            <div>
                <strong>#${p.idDulces}</strong> — ${p.nombre}
                <span class="text-success fw-bold ms-2">$${Number(p.precio).toFixed(2)}</span>
                <span class="text-muted ms-2">Stock: ${p.stock}</span>
                <span class="badge bg-light text-secondary ms-1">${p.descripcionDulce || ''}</span>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-sm btn-outline-primary" onclick="abrirEditor(${p.idDulces})">
                    ✏️ Editar
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="eliminarProducto(${p.idDulces}, '${p.nombre.replace(/'/g, "\\'")}')">
                    🗑
                </button>
            </div>
        </div>
    `).join('');
}

// ── TIPOS ─────────────────────────────────────────────────
async function cargarTipos() {
    try {
        const resp = await fetch('/api/tipos');
        const tipos = await resp.json();
        const select = document.getElementById('editTipo');
        select.innerHTML = tipos.map(t =>
            `<option value="${t.idTipoDulce}">${t.descripcionDulce}</option>`
        ).join('');
    } catch (err) {
        console.error('Error cargando tipos:', err);
    }
}

// ── ABRIR MODAL CREAR ─────────────────────────────────────
function abrirCreador() {
    document.getElementById('tituloModal').textContent = 'Nuevo Producto';
    document.getElementById('editId').value = '';
    document.getElementById('editNombre').value = '';
    document.getElementById('editPrecio').value = '';
    document.getElementById('editStock').value = '';
    // Resetear el select al primer tipo
    const select = document.getElementById('editTipo');
    if (select.options.length > 0) select.selectedIndex = 0;
    ocultarError();
    modalBS.show();
}

// ── ABRIR MODAL EDITAR ────────────────────────────────────
function abrirEditor(id) {
    const prod = todosLosProductos.find(p => p.idDulces === id);
    if (!prod) {
        alert('Producto no encontrado');
        return;
    }
    document.getElementById('tituloModal').textContent = 'Editar Producto';
    document.getElementById('editId').value = prod.idDulces;
    document.getElementById('editNombre').value = prod.nombre;
    document.getElementById('editPrecio').value = prod.precio;
    document.getElementById('editStock').value = prod.stock;
    document.getElementById('editTipo').value = prod.idTipoDulce;
    ocultarError();
    modalBS.show();
}

// ── GUARDAR (crear o editar) ──────────────────────────────
async function guardarProducto() {
    const id = document.getElementById('editId').value;
    const nombre = document.getElementById('editNombre').value.trim();
    const precio = parseFloat(document.getElementById('editPrecio').value);
    const stock = parseInt(document.getElementById('editStock').value);
    const idTipoDulce = parseInt(document.getElementById('editTipo').value);

    // Validación
    if (!nombre) { mostrarError('El nombre no puede estar vacío'); return; }
    if (isNaN(precio) || precio < 0) { mostrarError('El precio no es válido'); return; }
    if (isNaN(stock) || stock < 0) { mostrarError('El stock no es válido'); return; }
    if (isNaN(idTipoDulce)) { mostrarError('Selecciona un tipo de dulce'); return; }

    const btnGuardar = document.getElementById('btnGuardar');
    btnGuardar.disabled = true;
    btnGuardar.textContent = 'Guardando...';

    const url = id ? `/api/dulces/${id}` : '/api/dulces';
    const method = id ? 'PUT' : 'POST';

    try {
        const resp = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, precio, stock, idTipoDulce })
        });

        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.error || 'Error al guardar');
        }

        modalBS.hide();
        await listarProductosEdicion(); // Recargar lista
    } catch (err) {
        mostrarError(err.message);
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.textContent = 'Guardar';
    }
}

// ── ELIMINAR ──────────────────────────────────────────────
async function eliminarProducto(id, nombre) {
    if (!confirm(`¿Eliminar "${nombre}"?\nEsta acción no se puede deshacer.`)) return;

    try {
        const resp = await fetch(`/api/dulces/${id}`, { method: 'DELETE' });
        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.error || 'No se pudo eliminar');
        }
        await listarProductosEdicion();
    } catch (err) {
        alert('❌ Error al eliminar: ' + err.message);
    }
}

// ── HELPERS ───────────────────────────────────────────────
function mostrarError(msg) {
    const div = document.getElementById('modalError');
    div.textContent = msg;
    div.classList.remove('d-none');
}

function ocultarError() {
    document.getElementById('modalError').classList.add('d-none');
}