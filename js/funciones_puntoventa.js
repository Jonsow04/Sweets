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

// Lógica de Ticket
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

function verSeccion(sec) {
    alert("Abriendo sección: " + sec.toUpperCase());
}

// Inicio
cargarCatalogo();