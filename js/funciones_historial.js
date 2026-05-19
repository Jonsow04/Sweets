function renderHistorial() {

    const historial =
        JSON.parse(localStorage.getItem('historial')) || [];

    const contenedor =
        document.getElementById('contenedorHistorial');

    if (historial.length === 0) {

        contenedor.innerHTML = `
            <div class="text-center p-4">
                <p class="text-muted">
                    No hay ventas registradas todavía.
                </p>
            </div>
        `;

        return;
    }

    contenedor.innerHTML = historial.map(venta => `

        <div class="list-group-item mb-3 shadow-sm border-start border-danger border-4">

            <div class="d-flex justify-content-between align-items-center">

                <div>

                    <h6 class="mb-1 fw-bold">
                        Ticket: ${venta.folio}
                    </h6>

                    <small class="text-muted">
                        ${venta.fecha}
                    </small>

                </div>

                <div class="text-end">

                    <span class="badge bg-success fs-6">
                        $${venta.total.toFixed(2)}
                    </span>

                    <br>

                    <small class="text-muted">
                        Atendió: ${venta.cajero || 'Admin'}
                    </small>

                </div>
            </div>

            <hr class="my-2">

            <div class="small text-secondary">

                <strong>Detalle:</strong>

                ${venta.items.map(i =>
                    `${i.cant}x ${i.nombre}`
                ).join(', ')}

            </div>

        </div>

    `).reverse().join('');
}

function actualizarNombreUsuario() {

    const usuario =
        localStorage.getItem('cajeroActual') || "Admin";

    const userTag =
        document.getElementById('userTag');

    if (userTag) {
        userTag.innerText = `Cajero: ${usuario}`;
    }
}

document.addEventListener('DOMContentLoaded', () => {

    actualizarNombreUsuario();

    if (document.getElementById('contenedorHistorial')) {
        renderHistorial();
    }
});