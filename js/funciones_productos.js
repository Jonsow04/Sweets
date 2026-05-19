const ROL = sessionStorage.getItem('cajeroRol') || 'cajero';
let todosLosProductos = [];
let modalBS;

document.addEventListener('DOMContentLoaded', () => {

    if (ROL !== 'admin') {
        const accesoNegado = document.getElementById('accesoNegado');
        const contenidoAdmin = document.getElementById('contenidoAdmin');
        if (accesoNegado) {
            accesoNegado.classList.remove('d-none');
        }
        if (contenidoAdmin) {
            contenidoAdmin.classList.add('d-none');
        }
        return;
    }
    modalBS = new bootstrap.Modal(
        document.getElementById('modalProducto'), { backdrop: 'static' }
    );
    document
        .getElementById('btnGuardar')
        .addEventListener('click', guardarProducto);

    listarProductosEdicion();
    cargarTipos();
});

function getHeaders() {
    return { 'Content-Type': 'application/json', 'x-user-rol': ROL };
}

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
    renderProductos(todosLosProductos.filter(p =>
        p.nombre.toLowerCase().includes(texto.toLowerCase())
    ));
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
                <button class="btn btn-sm btn-outline-danger"
                        onclick="eliminarProducto(${p.idDulces}, '${p.nombre.replace(/'/g, "\\'")}')">
                    🗑
                </button>
            </div>
        </div>
    `).join('');
}

async function cargarTipos() {
    try {
        const resp = await fetch('/api/tipos');
        const tipos = await resp.json();
        document.getElementById('editTipo').innerHTML = tipos.map(t =>
            `<option value="${t.idTipoDulce}">${t.descripcionDulce}</option>`
        ).join('');
    } catch (err) {
        console.error('Error cargando tipos:', err);
    }
}

function abrirCreador() {
    document.getElementById('tituloModal').textContent = 'Nuevo Producto';
    document.getElementById('editId').value = '';
    document.getElementById('editNombre').value = '';
    document.getElementById('editPrecio').value = '';
    document.getElementById('editStock').value = '';
    const select = document.getElementById('editTipo');
    if (select.options.length > 0) select.selectedIndex = 0;
    document.getElementById('modalError').classList.add('d-none');
    modalBS.show();
}

function abrirEditor(id) {
    const prod = todosLosProductos.find(p => p.idDulces === id);
    if (!prod) { alert('Producto no encontrado'); return; }
    document.getElementById('tituloModal').textContent = 'Editar Producto';
    document.getElementById('editId').value = prod.idDulces;
    document.getElementById('editNombre').value = prod.nombre;
    document.getElementById('editPrecio').value = prod.precio;
    document.getElementById('editStock').value = prod.stock;
    document.getElementById('editTipo').value = prod.idTipoDulce;
    document.getElementById('modalError').classList.add('d-none');
    modalBS.show();
}

async function guardarProducto() {
    const id = document.getElementById('editId').value;
    const nombre = document.getElementById('editNombre').value.trim();
    const precio = parseFloat(document.getElementById('editPrecio').value);
    const stock = parseInt(document.getElementById('editStock').value);
    const idTipoDulce = parseInt(document.getElementById('editTipo').value);
    const errDiv = document.getElementById('modalError');
    const btn = document.getElementById('btnGuardar');

    if (!nombre) {
        errDiv.textContent = 'El nombre no puede estar vacío';
        errDiv.classList.remove('d-none');
        return;
    }
    if (isNaN(precio) || precio < 0) {
        errDiv.textContent = 'Precio no válido';
        errDiv.classList.remove('d-none');
        return;
    }
    if (isNaN(stock) || stock < 0) {
        errDiv.textContent = 'Stock no válido';
        errDiv.classList.remove('d-none');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
        const resp = await fetch(id ? `/api/dulces/${id}` : '/api/dulces', {
            method: id ? 'PUT' : 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ nombre, precio, stock, idTipoDulce })
        });
        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.error || 'Error al guardar');
        }
        modalBS.hide();
        await listarProductosEdicion();
    } catch (err) {
        errDiv.textContent = err.message;
        errDiv.classList.remove('d-none');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar';
    }
}

async function eliminarProducto(id, nombre) {
    if (!confirm(`¿Eliminar "${nombre}"?\n\nSi este producto tiene ventas registradas, no se podrá eliminar para mantener el historial intacto.`)) return;
    try {
        const resp = await fetch(`/api/dulces/${id}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        if (!resp.ok) {
            const err = await resp.json();
            // Error de llave foránea — mensaje amigable
            if (err.error && err.error.includes('foreign key')) {
                alert(`⚠️ No se puede eliminar "${nombre}" porque tiene ventas registradas en el historial.\n\nPuedes editar su stock a 0 para que no aparezca disponible en caja.`);
            } else {
                throw new Error(err.error || 'No se pudo eliminar');
            }
            return;
        }
        await listarProductosEdicion();
    } catch (err) {
        alert('❌ Error: ' + err.message);
    }
}