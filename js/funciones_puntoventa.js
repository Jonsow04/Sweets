// DATOS DEFINIDOS, ESTOS SE QUITAN CUANDO YA TENGAMOS LA BASE
const productosDB = [
    { id: "001", nombre: "Gomitas Gusano", precio: 15.00 },
    { id: "002", nombre: "Chocolate Suizo", precio: 55.00 },
    { id: "003", nombre: "Paleta Payaso", precio: 22.50 },
    { id: "004", nombre: "Caramelo Macizo", precio: 5.00 },
    { id: "005", nombre: "Bombón Gigante", precio: 10.00 }
];

let carrito = [];

function cargarCatalogo(filtro = "") {
    const lista = document.getElementById('listaRapida');
    lista.innerHTML = "";

    const filtrados = productosDB.filter(p =>
        p.nombre.toLowerCase().includes(filtro.toLowerCase()) ||
        p.id.includes(filtro)
    );

    filtrados.forEach(p => {
        lista.innerHTML += `
                    <div class="list-item d-flex justify-content-between" onclick="agregarVenta('${p.id}')">
                        <span>${p.nombre}</span>
                        <span class="text-muted">$${p.precio.toFixed(2)}</span>
                    </div>
                `;
    });
}

function filtrarInventario() {
    const busqueda = document.getElementById('navSearch').value;
    cargarCatalogo(busqueda);
}

function agregarVenta(id) {
    const prod = productosDB.find(p => p.id === id);
    const existe = carrito.find(p => p.id === id);

    if (existe) {
        existe.cant++;
    } else {
        carrito.push({...prod, cant: 1 });
    }
    renderVenta();
}

function renderVenta() {
    const tbody = document.querySelector("#tablaVentas tbody");
    tbody.innerHTML = "";
    let total = 0;

    carrito.forEach((p, idx) => {
        const sub = p.precio * p.cant;
        total += sub;
        tbody.innerHTML += `
                    <tr>
                        <td>${p.nombre}</td>
                        <td>$${p.precio.toFixed(2)}</td>
                        <td><input type="number" class="form-control form-control-sm" value="${p.cant}" onchange="editCant(${idx}, this.value)"></td>
                        <td class="fw-bold">$${sub.toFixed(2)}</td>
                        <td><button class="btn btn-sm text-danger" onclick="borrarItem(${idx})">×</button></td>
                    </tr>
                `;
    });
    document.getElementById('granTotal').textContent = `$${total.toFixed(2)}`;
}

function editCant(idx, val) {
    carrito[idx].cant = val < 1 ? 1 : parseInt(val);
    renderVenta();
}

function borrarItem(idx) {
    carrito.splice(idx, 1);
    renderVenta();
}
//ticket
document.getElementById('ticketModal').addEventListener('show.bs.modal', () => {
    document.getElementById('fechaTicket').textContent = new Date().toLocaleString();
    const cont = document.getElementById('listaProductosTicket');
    const total = document.getElementById('granTotal').textContent;

    cont.innerHTML = carrito.map(p => `
                <div class="d-flex justify-content-between small">
                    <span>${p.cant}x ${p.nombre}</span>
                    <span>$${(p.precio * p.cant).toFixed(2)}</span>
                </div>
            `).join('');
    document.getElementById('totalTicketModal').textContent = total;
});

function confirmarVenta() {
    alert("Venta guardada.");
    carrito = [];
    renderVenta();
    bootstrap.Modal.getInstance(document.getElementById('ticketModal')).hide();
}

function mostrarHistorialCompleto() {
    const ventas = JSON.parse(localStorage.getItem('historial')) || [];
    const contenedor = document.getElementById('contenedorHistorial'); // ID en historial.html

    if (ventas.length === 0) {
        contenedor.innerHTML = "<p class='text-center'>No hay ventas registradas.</p>";
        return;
    }

    contenedor.innerHTML = ventas.map(v => `
        <div class="card mb-3 shadow-sm">
            <div class="card-body d-flex justify-content-between align-items-center">
                <div>
                    <h6 class="mb-0">Ticket: ${v.folio}</h6>
                    <small class="text-muted">${v.fecha}</small>
                </div>
                <div class="text-end">
                    <span class="fw-bold text-success">$${v.total.toFixed(2)}</span><br>
                    <small>Atendió: ${v.cajero || 'Admin'}</small>
                </div>
            </div>
        </div>
    `).reverse().join('');
}

function mostrarHistorialCompleto() {
    const ventas = JSON.parse(localStorage.getItem('historial')) || [];
    const contenedor = document.getElementById('contenedorHistorial');

    if (ventas.length === 0) {
        contenedor.innerHTML = "<p class='text-center text-muted'>No hay ventas registradas.</p>";
        return;
    }

    contenedor.innerHTML = ventas.map(v => `
        <div class="card mb-3 shadow-sm">
            <div class="card-body d-flex justify-content-between align-items-center">
                <div>
                    <h6 class="mb-0">Ticket: ${v.folio}</h6>
                    <small class="text-muted">${v.fecha}</small>
                </div>
                <div class="text-end">
                    <span class="fw-bold text-success">$${v.total.toFixed(2)}</span><br>
                    <small>Atendió: ${v.cajero || 'Admin'}</small>
                </div>
            </div>
        </div>
    `).reverse().join('');
}
//cambiar usuario
function cambiarCajero() {
    const nombre = prompt("Ingrese nombre del nuevo cajero:");
    if (nombre) {
        localStorage.setItem('cajeroActual', nombre);
        location.reload();
    }
}

function confirmarVenta() {
    if (carrito.length === 0) return alert("El carrito está vacío");
    const totalVenta = carrito.reduce((sum, p) => sum + (p.precio * p.cant), 0);
    const folio = Math.floor(Math.random() * 1000000);
    const fecha = new Date().toLocaleString();

    const nuevaVenta = {
        folio: folio,
        fecha: fecha,
        total: totalVenta,
        cajero: cajero,
        items: [...carrito]
    };
    //lo guarda en el local storage por mientras
    const historial = JSON.parse(localStorage.getItem('historial')) || [];
    historial.push(nuevaVenta);
    localStorage.setItem('historial', JSON.stringify(historial));

    const productosDB_local = JSON.parse(localStorage.getItem('productos')) || [];
    carrito.forEach(itemCarrito => {
        const p = productosDB.find(pDB => pDB.id === itemCarrito.id);
        if (p) p.ventas = (p.ventas || 0) + itemCarrito.cant;
    });

    alert(`Venta guardada con éxito. Folio: ${folio}`);
    carrito = [];
    renderVenta();
    bootstrap.Modal.getInstance(document.getElementById('ticketModal')).hide();
}
//cerrar caje
function cerrarSesion() {
    if (confirm("¿Estás seguro de que quieres salir del sistema?")) {
        localStorage.removeItem('cajeroActual');
        //limpiar carro
        carrito = [];
        localStorage.removeItem('carrito');
        //inicio
        window.location.href = 'inicio.html';
    }
}

function cambiarCajero() {
    const nombre = prompt("Ingrese nombre del nuevo cajero:");
    if (nombre) {
        localStorage.setItem('cajeroActual', nombre);
        const userTag = document.getElementById('userTag');
        if (userTag) userTag.innerText = `Cajero: ${nombre}`;
        location.reload();
    }
}
cargarCatalogo();