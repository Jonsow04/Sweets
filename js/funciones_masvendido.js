/*se genera un tippo ranling para los dulces
 */
function generarRanking() {
    // se agrarra del localstorage, aca se quita con lo de la base
    const prods = JSON.parse(localStorage.getItem('productos')) || [];
    const contenedor = document.getElementById('contenedorRanking');

    //filtra segun las ventas
    const ranking = prods
        .filter(p => p.ventas > 0)
        .sort((a, b) => b.ventas - a.ventas);

    if (ranking.length === 0) {
        contenedor.innerHTML = `
            <div class="text-center p-5">
                <h1 class="display-1">🍭</h1>
                <p class="text-muted">Aún no se han realizado ventas para generar un ranking.</p>
            </div>`;
        return;
    }

    // obtiene el maximo de ventas
    const maxVentas = ranking[0].ventas;

    contenedor.innerHTML = ranking.map((p, index) => {
        // calcula el porcentaje de la venta
        const porcentaje = (p.ventas / maxVentas) * 100;
        const medalla = index === 0 ? '#1' : index === 1 ? '#2' : index === 2 ? '#3' : '🍬';

        return `
            <div class="mb-4">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <span class="fw-bold">${medalla} ${p.nombre}</span>
                    <span class="badge bg-primary rounded-pill">${p.ventas} unidades</span>
                </div>
                <div class="progress" style="height: 25px; border-radius: 12px;">
                    <div class="progress-bar progress-bar-striped progress-bar-animated" 
                         role="progressbar" 
                         style="width: ${porcentaje}%; background-color: ${obtenerColor(index)};" 
                         aria-valuenow="${porcentaje}" aria-valuemin="0" aria-valuemax="100">
                         $${(p.precio * p.ventas).toFixed(2)} generados
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/* aqui se hace un tipo de contador, qe mide las ganacias y se le assgina un color diferente
a cada producto
 */
function obtenerColor(index) {
    const colores = ['#ff4081', '#7b1fa2', '#512da8', '#303f9f', '#1976d2'];
    return colores[index] || '#607d8b';
}