let todosLosProductos = [];
let modalBS;

document.addEventListener('DOMContentLoaded', () => {
    modalBS = new bootstrap.Modal(document.getElementById('modalProducto'));
    listarProductosEdicion();
    cargarTipos();
});

async function listarProductosEdicion() {
    const contenedor = document.getElementById('listaProductos');
    try {
        const resp = await fetch('/api/dulces');
        todosLosProductos = await resp.json();
        renderProductos(todosLosProductos);
    } catch (err) {
        contenedor.innerHTML = '<p class="text-danger text-center">Error al cargar</p>';
    }
}

function filtrarProductos(texto) {
    renderProductos(todosLosProductos.filter(p =>
        p.nombre.toLowerCase().includes(texto.toLowerCase())
    ));
}

function renderProductos(lista) {
    const contenedor = document.getElementById('listaProductos');
    if (!lista.length) { contenedor.innerHTML = '<p class="text-muted text-center">No hay productos.</p>'; return; }
    contenedor.innerHTML = lista.map(p => `
        <div class="d-flex justify-content-between align-items-center border p-3 mb-2 bg-white rounded shadow-sm">
            <div>
                <strong>#${p.idDulces}</strong> — ${p.nombre}
                <span class="text-success fw-bold ms-2">$${Number(p.precio).toFixed(2)}</span>
                <span class="text-muted ms-2">Stock: ${p.stock}</span>
                <span class="badge bg-light text-secondary ms-1">${p.descripcionDulce || ''}</span>
            </div>
            <div>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="abrirEditor(${p.idDulces})">✏️ Editar</button>
                <button class="btn btn-sm btn-outline-danger" onclick="eliminarProducto(${p.idDulces})">🗑</button>
            </div>
        </div>
    `).join('');
}

async function cargarTipos() {
    const resp = await fetch('/api/tipos');
    const tipos = await resp.json();
    document.getElementById('editTipo').innerHTML = tipos.map(t =>
        `<option value="${t.idTipoDulce}">${t.descripcionDulce}</option>`
    ).join('');
}

function abrirCreador() {
    document.getElementById('tituloModal').textContent = 'Nuevo Producto';
    document.getElementById('editId').value = '';
    document.getElementById('editNombre').value = '';
    document.getElementById('editPrecio').value = '';
    document.getElementById('editStock').value = '';
    modalBS.show();
}

function abrirEditor(id) {
    const prod = todosLosProductos.find(p => p.idDulces === id);
    if (!prod) return;
    document.getElementById('tituloModal').textContent = 'Editar Producto';
    document.getElementById('editId').value = prod.idDulces;
    document.getElementById('editNombre').value = prod.nombre;
    document.getElementById('editPrecio').value = prod.precio;
    document.getElementById('editStock').value = prod.stock;
    document.getElementById('editTipo').value = prod.idTipoDulce;
    modalBS.show();
}

async function guardarProducto() {
    const id = document.getElementById('editId').value;
    const nombre = document.getElementById('editNombre').value.trim();
    const precio = parseFloat(document.getElementById('editPrecio').value);
    const stock = parseInt(document.getElementById('editStock').value);
    const idTipoDulce = parseInt(document.getElementById('editTipo').value);
    if (!nombre || isNaN(precio) || isNaN(stock)) { alert('Completa todos los campos'); return; }

    try {
        const resp = await fetch(id ? `/api/dulces/${id}` : '/api/dulces', {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, precio, stock, idTipoDulce })
        });
        if (!resp.ok) throw new Error((await resp.json()).error);
        modalBS.hide();
        listarProductosEdicion();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function eliminarProducto(id) {
    if (!confirm('¿Eliminar este producto?')) return;
    try {
        await fetch(`/api/dulces/${id}`, { method: 'DELETE' });
        listarProductosEdicion();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}