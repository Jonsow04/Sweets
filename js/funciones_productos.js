/*AQUI ES DE EJEMPLO, CARGUE DATOS PARA PRUEBAS, SE CAMBIARA SEGUN LA BASE 
 */
function listarProductosEdicion() {
    let prods = JSON.parse(localStorage.getItem('productos'));
    if (!prods) {
        prods = [
            { id: "001", nombre: "Gomitas Gusano", precio: 15.00, ventas: 0 },
            { id: "002", nombre: "Chocolate Suizo", precio: 55.00, ventas: 0 },
            { id: "003", nombre: "Paleta Payaso", precio: 22.50, ventas: 0 },
            { id: "004", nombre: "Caramelo Macizo", precio: 5.00, ventas: 0 },
            { id: "005", nombre: "Bombón Gigante", precio: 10.00, ventas: 0 }
        ];
        localStorage.setItem('productos', JSON.stringify(prods));
    }

    const contenedor = document.getElementById('listaProductos');
    if (!contenedor) return;

    contenedor.innerHTML = prods.map(p => `
        <div class="d-flex justify-content-between align-items-center border p-3 mb-2 bg-white rounded shadow-sm">
            <div>
                <strong>${p.id}</strong> - ${p.nombre} 
                <span class="text-success fw-bold ml-2">($${p.precio.toFixed(2)})</span>
            </div>
            <div>
                <button class="btn btn-sm btn-outline-primary" onclick="abrirEditor('${p.id}')">Modificar</button>
                <button class="btn btn-sm btn-outline-danger" onclick="eliminarProducto('${p.id}')">Eliminar</button>
            </div>
        </div>
    `).join('');

}
//crear producto
function abrirCreador() {
    console.log("Abriendo el creador...");
    const titulo = document.getElementById('tituloModal');
    const inputId = document.getElementById('inputId');

    if (titulo && inputId) {
        titulo.innerText = "Nuevo Producto";
        inputId.disabled = false;
        limpiarFormulario();
        mostrarModal();
    }
}

//modificar
function abrirEditor(id) {
    const prods = JSON.parse(localStorage.getItem('productos'));
    const p = prods.find(item => item.id === id);

    if (p) {
        document.getElementById('tituloModal').innerText = "Editar Producto";
        document.getElementById('inputId').value = p.id;
        document.getElementById('inputId').disabled = true;
        document.getElementById('inputNom').value = p.nombre;
        document.getElementById('inputPre').value = p.precio;
        mostrarModal();
    }
}
//guardar
function procesarProducto() {
    const id = document.getElementById('inputId').value;
    const nombre = document.getElementById('inputNom').value;
    const precio = parseFloat(document.getElementById('inputPre').value);

    if (!id || !nombre || isNaN(precio)) return alert("Completa todos los campos");

    let prods = JSON.parse(localStorage.getItem('productos')) || [];
    const index = prods.findIndex(p => p.id === id);

    if (index !== -1) { //existencia
        prods[index].nombre = nombre;
        prods[index].precio = precio;
    } else {
        prods.push({ id, nombre, precio, ventas: 0 });
    }

    localStorage.setItem('productos', JSON.stringify(prods));
    cerrarModal();
    listarProductosEdicion();
}

//eliminar
function eliminarProducto(id) {
    if (confirm(`¿Seguro que deseas eliminar el producto ${id}?`)) {
        let prods = JSON.parse(localStorage.getItem('productos'));
        const nuevosProds = prods.filter(p => p.id !== id);
        localStorage.setItem('productos', JSON.stringify(nuevosProds));
        listarProductosEdicion();
    }
}

function mostrarModal() {
    document.getElementById('modalProducto').style.display = 'block';
    document.getElementById('overlay').style.display = 'block';
}

function cerrarModal() {
    document.getElementById('modalProducto').style.display = 'none';
    document.getElementById('overlay').style.display = 'none';
}

function limpiarFormulario() {
    document.getElementById('inputId').value = "";
    document.getElementById('inputNom').value = "";
    document.getElementById('inputPre').value = "";
}