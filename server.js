// server.js (versión con Saga Pattern integrado + mejoras)
const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const cors = require('cors');
const SweetsFederatedTransactionManager = require('./js/SweetsFederatedTransactionManager.js');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// =====================================================
// CONEXIONES A BASE DE DATOS LOCAL Y FEDERADA
// =====================================================

// Conexión a BD LOCAL (sweets) - Para operaciones reales
const dbLocal = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'G7k#2pR9',
    database: 'sweets',
    port: 3306
});

// Conexión a BD FEDERADA (sweetsfederated) - Para replicación
const dbFederated = mysql.createConnection({
    host: '192.168.10.102',  // ← IP del servidor remoto
    user: 'admin',
    password: 'admin123',
    database: 'sweetsfederated',
    port: 3306
});

// Convertir a promesas para usar async/await
const dbLocalPromise = dbLocal.promise();
const dbFederatedPromise = dbFederated.promise();

// Conectar a BD local
dbLocal.connect((err) => {
    if (err) {
        console.error('❌ Error al conectar a MySQL Local:', err.message);
        process.exit(1);
    }
    console.log('✅ Conectado a MySQL LOCAL - Base de datos: sweets');
});

// Conectar a BD federada
dbFederated.connect((err) => {
    if (err) {
        console.error('⚠️ Error al conectar a MySQL FEDERADA:', err.message);
        console.error('⚠️ Las operaciones federadas fallarán, el sistema continuará');
    } else {
        console.log('✅ Conectado a MySQL FEDERADA - Base de datos: sweetsfederated');
    }
});

// Inicializar el Transaction Manager para operaciones federadas
let txManager = null;
try {
    txManager = new SweetsFederatedTransactionManager(dbLocalPromise, dbFederatedPromise);
    console.log('✅ Transaction Manager inicializado (Saga Pattern)');
} catch (error) {
    console.error('❌ Error al inicializar Transaction Manager:', error.message);
}

// Helper para queries locales
function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        dbLocal.query(sql, params, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
}

// Función para obtener fecha local (del CÓDIGO 2)
function getFechaLocal() {
    const ahora = new Date();
    const offset = -7; // UTC-7 en verano (mayo-noviembre), cambia a -6 en invierno
    const local = new Date(ahora.getTime() + offset * 60 * 60 * 1000);
    return local.toISOString().split('T')[0]; // YYYY-MM-DD
}

// =====================================================
// ENDPOINTS DE DULCES
// =====================================================

app.get('/api/dulces', async(req, res) => {
    try {
        const rows = await query(`
            SELECT d.idDulces, d.nombre, d.precio, d.stock, 
                   d.idTipoDulce, t.descripcionDulce
            FROM dulce d
            LEFT JOIN tipodulce t ON d.idTipoDulce = t.idTipoDulce
            ORDER BY d.nombre
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/dulces/:id', async(req, res) => {
    try {
        const rows = await query('SELECT * FROM dulce WHERE idDulces = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/dulces', async(req, res) => {
    const { nombre, precio, stock, idTipoDulce } = req.body;
    if (!nombre || precio == null || stock == null || !idTipoDulce)
        return res.status(400).json({ error: 'Faltan campos requeridos' });
    try {
        const result = await query(
            'INSERT INTO dulce (nombre, precio, stock, idTipoDulce) VALUES (?, ?, ?, ?)', 
            [nombre, precio, stock, idTipoDulce]
        );
        const nuevo = await query('SELECT * FROM dulce WHERE idDulces = ?', [result.insertId]);
        
        // Sincronizar con tabla federada (si está disponible)
        if (txManager) {
            await txManager.syncDulceToFederated(result.insertId);
        }
        
        res.status(201).json(nuevo[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/dulces/:id', async(req, res) => {
    const { nombre, precio, stock, idTipoDulce } = req.body;
    try {
        await query(
            'UPDATE dulce SET nombre=?, precio=?, stock=?, idTipoDulce=? WHERE idDulces=?', 
            [nombre, precio, stock, idTipoDulce, req.params.id]
        );
        const updated = await query('SELECT * FROM dulce WHERE idDulces = ?', [req.params.id]);
        
        // Sincronizar con tabla federada (si está disponible)
        if (txManager) {
            await txManager.syncDulceToFederated(req.params.id);
        }
        
        res.json(updated[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/dulces/:id', async(req, res) => {
    try {
        // Eliminar también de tabla federada
        if (txManager) {
            await txManager.federatedDelete('dulceFED', req.params.id, 'idDulces');
        }
        await query('DELETE FROM dulce WHERE idDulces = ?', [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =====================================================
// ENDPOINTS DE TIPOS DE DULCES
// =====================================================

app.get('/api/tipos', async(req, res) => {
    try {
        const rows = await query('SELECT * FROM tipodulce ORDER BY descripcionDulce');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tipos', async(req, res) => {
    const { descripcionDulce } = req.body;
    try {
        const result = await query(
            'INSERT INTO tipodulce (descripcionDulce) VALUES (?)', [descripcionDulce]
        );
        
        // Sincronizar con tabla federada
        if (txManager) {
            await txManager.syncTipoDulceToFederated(result.insertId);
        }
        
        res.status(201).json({ idTipoDulce: result.insertId, descripcionDulce });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =====================================================
// ENDPOINTS DE VENTAS (CONSULTA - DEL CÓDIGO 2)
// =====================================================

app.get('/api/ventas', async(req, res) => {
    try {
        const ventas = await query(`
            SELECT v.idVenta, v.fecha, v.total,
                   c.nombre AS cliente_nombre,
                   CONCAT(e.nombre, ' ', e.apPat) AS empleado_nombre
            FROM venta v
            LEFT JOIN cliente c ON v.idCliente = c.idCliente
            LEFT JOIN empleado e ON v.idEmpleado = e.idEmpleado
            ORDER BY v.fecha DESC, v.idVenta DESC
            LIMIT 100
        `);
        for (let v of ventas) {
            v.items = await query(`
                SELECT dv.cantidad, dv.costo, d.nombre AS dulce_nombre, d.precio
                FROM detalleventa dv
                JOIN dulce d ON dv.idDulce = d.idDulces
                WHERE dv.idVenta = ?
            `, [v.idVenta]);
        }
        res.json(ventas);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =====================================================
// ENDPOINT CRÍTICO: VENTAS (CREACIÓN CON SAGA - MODIFICADO)
// =====================================================

app.post('/api/ventas', async(req, res) => {
    const { items, empleado_nombre } = req.body;
    if (!items || items.length === 0)
        return res.status(400).json({ error: 'El carrito está vacío' });

    // Generar ID de saga para trazabilidad
    const sagaId = `venta_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
        // ==============================================
        // PASO 1: Preparar datos (cliente y empleado)
        // ==============================================
        
        let clienteId = 1;
        const clientes = await query("SELECT idCliente FROM cliente WHERE nombre = 'Cliente General'");
        if (clientes.length === 0) {
            const r = await query("INSERT INTO cliente (nombre, email, telefono) VALUES ('Cliente General', '', '')");
            clienteId = r.insertId;
        } else {
            clienteId = clientes[0].idCliente;
        }

        let empleadoId = 1;
        const emps = await query('SELECT idEmpleado FROM empleado LIMIT 1');
        if (emps.length > 0) {
            empleadoId = emps[0].idEmpleado;
        } else {
            const puestoRows = await query("SELECT idPuestoEmpleado FROM puestoempleado LIMIT 1");
            let puestoId;
            if (puestoRows.length === 0) {
                const p = await query(
                    "INSERT INTO puestoempleado (nombrePuesto, salario, horario, descripcion) VALUES ('Cajero', 8000, '9-18', 'Cajero de tienda')"
                );
                puestoId = p.insertId;
            } else {
                puestoId = puestoRows[0].idPuestoEmpleado;
            }
            const e = await query(
                "INSERT INTO empleado (nombre, apPat, apMat, email, idPuestoEmpleado) VALUES ('Admin', 'Admin', '', 'admin@sweets.com', ?)", [puestoId]
            );
            empleadoId = e.insertId;
        }

        const total = items.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
        const fecha = getFechaLocal(); // Usando la función del CÓDIGO 2

        // ==============================================
        // PASO 2: Verificar stock (BD local)
        // ==============================================
        
        for (const item of items) {
            const [stockResult] = await query(
                'SELECT stock, nombre FROM dulce WHERE idDulces = ?', 
                [item.idDulce]
            );
            if (!stockResult) {
                throw new Error(`Producto con ID ${item.idDulce} no encontrado`);
            }
            if (stockResult.stock < item.cantidad) {
                throw new Error(`Stock insuficiente para "${stockResult.nombre}". Disponible: ${stockResult.stock}`);
            }
        }

        // ==============================================
        // PASO 3: Registrar venta en BD LOCAL (operación principal)
        // ==============================================
        
        const ventaResult = await query(
            'INSERT INTO venta (fecha, idEmpleado, idCliente, total) VALUES (?, ?, ?, ?)', 
            [fecha, empleadoId, clienteId, total]
        );
        const idVenta = ventaResult.insertId;

        const itemsConStockOriginal = [];
        for (const item of items) {
            const [stockOriginal] = await query(
                'SELECT stock FROM dulce WHERE idDulces = ?', 
                [item.idDulce]
            );
            itemsConStockOriginal.push({
                ...item,
                stock_original: stockOriginal.stock
            });
            
            await query(
                'INSERT INTO detalleventa (cantidad, costo, idDulce, idVenta) VALUES (?, ?, ?, ?)', 
                [item.cantidad, item.precio * item.cantidad, item.idDulce, idVenta]
            );
            
            await query(
                'UPDATE dulce SET stock = stock - ? WHERE idDulces = ?', 
                [item.cantidad, item.idDulce]
            );
        }

        // ==============================================
        // PASO 4: Sincronizar con TABLAS FEDERADAS (usando Saga)
        // ==============================================
        
        let federatedSyncSuccess = false;
        
        if (txManager) {
            try {
                const operacionesFederadas = [];
                
                for (const item of items) {
                    const nuevoStock = itemsConStockOriginal.find(i => i.idDulce === item.idDulce).stock_original - item.cantidad;
                    operacionesFederadas.push({
                        tipo: 'UPDATE',
                        tabla: 'dulceFED',
                        id: item.idDulce,
                        campoId: 'idDulces',
                        datos: {
                            idDulces: item.idDulce,
                            stock: nuevoStock
                        },
                        datos_originales: {
                            idDulces: item.idDulce,
                            stock: itemsConStockOriginal.find(i => i.idDulce === item.idDulce).stock_original
                        }
                    });
                }
                
                operacionesFederadas.push({
                    tipo: 'INSERT',
                    tabla: 'ventaFED',
                    datos: {
                        idVenta: idVenta,
                        fecha: fecha,
                        total: total,
                        idEmpleado: empleadoId,
                        idCliente: clienteId
                    }
                });
                
                for (const item of items) {
                    operacionesFederadas.push({
                        tipo: 'INSERT',
                        tabla: 'detalleVentaFED',
                        datos: {
                            idVenta: idVenta,
                            idDulce: item.idDulce,
                            cantidad: item.cantidad,
                            costo: item.precio * item.cantidad
                        }
                    });
                }
                
                const sagaResult = await txManager.executeSagaTransaction(operacionesFederadas, sagaId);
                federatedSyncSuccess = sagaResult.success;
                
                if (!federatedSyncSuccess) {
                    console.error(`⚠️ Saga falló para venta ${idVenta}:`, sagaResult.error);
                }
                
            } catch (federatedError) {
                console.error('❌ Error en sincronización federada:', federatedError);
                federatedSyncSuccess = false;
            }
        } else {
            console.warn('⚠️ Transaction Manager no disponible, no se sincronizó con tablas federadas');
        }

        // ==============================================
        // PASO 5: Respuesta al cliente
        // ==============================================
        
        res.status(201).json({ 
            ok: true, 
            idVenta, 
            total, 
            fecha, 
            cajero: empleado_nombre || 'Admin',
            federated_sync: federatedSyncSuccess,
            saga_id: sagaId,
            message: federatedSyncSuccess ? 
                'Venta registrada y sincronizada correctamente' : 
                'Venta registrada localmente. La sincronización federada se reintentará automáticamente.'
        });
        
    } catch (err) {
        console.error('Error registrando venta:', err);
        res.status(500).json({ 
            error: err.message,
            saga_id: sagaId
        });
    }
});

// =====================================================
// ENDPOINTS DE PRODUCTOS MÁS VENDIDOS
// =====================================================

app.get('/api/masvendidos', async(req, res) => {
    try {
        const rows = await query(`
            SELECT d.idDulces, d.nombre, d.precio,
                   IFNULL(SUM(dv.cantidad), 0) AS ventas
            FROM dulce d
            LEFT JOIN detalleventa dv ON d.idDulces = dv.idDulce
            GROUP BY d.idDulces, d.nombre, d.precio
            ORDER BY ventas DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =====================================================
// ENDPOINTS DE CORTES DE CAJA
// =====================================================

app.get('/api/cortes', async(req, res) => {
    try {
        const rows = await query('SELECT * FROM corteventa ORDER BY fechaCorte DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/cortes', async(req, res) => {
    try {
        const stats = await query(`
            SELECT IFNULL(SUM(dv.cantidad * dv.costo), 0) AS total,
                   COUNT(DISTINCT v.idVenta) AS numVentas
            FROM venta v
            JOIN detalleventa dv ON v.idVenta = dv.idVenta
            WHERE v.idCorteVenta IS NULL
        `);
        const { total, numVentas } = stats[0];
        const fecha = getFechaLocal(); // Usando función del CÓDIGO 2
        const result = await query(
            'INSERT INTO corteventa (fechaCorte, totalVentas, numVentas, createAt) VALUES (?, ?, ?, NOW())', 
            [fecha, total, numVentas]
        );
        const idCorte = result.insertId;
        await query('UPDATE venta SET idCorteVenta = ? WHERE idCorteVenta IS NULL', [idCorte]);
        res.json({ ok: true, idCorte, total, numVentas, fecha });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =====================================================
// ENDPOINTS DE SINCRONIZACIÓN FEDERADA (SAGA)
// =====================================================

// Sincronizar un dulce específico
app.post('/api/sync/dulce/:id', async (req, res) => {
    if (!txManager) {
        return res.status(503).json({ error: 'Transaction Manager no disponible' });
    }
    const resultado = await txManager.syncDulceToFederated(req.params.id);
    res.json(resultado);
});

// Sincronización masiva
app.post('/api/sync/all', async (req, res) => {
    if (!txManager) {
        return res.status(503).json({ error: 'Transaction Manager no disponible' });
    }
    const resultado = await txManager.syncAllToFederated(req.body.ids);
    res.json(resultado);
});

// Ver estado de una saga
app.get('/api/saga/:sagaId', async (req, res) => {
    if (!txManager) {
        return res.status(503).json({ error: 'Transaction Manager no disponible' });
    }
    const estado = await txManager.getSagaStatus(req.params.sagaId);
    res.json(estado);
});

// Reintentar operaciones federadas fallidas
app.post('/api/retry-failed', async (req, res) => {
    if (!txManager) {
        return res.status(503).json({ error: 'Transaction Manager no disponible' });
    }
    const resultado = await txManager.retryFailedOperations();
    res.json(resultado);
});

// Ver operaciones pendientes
app.get('/api/saga/pendientes', async (req, res) => {
    if (!txManager) {
        return res.status(503).json({ error: 'Transaction Manager no disponible' });
    }
    try {
        const [rows] = await dbLocalPromise.execute(
            'SELECT COUNT(*) as count FROM saga_log_federated WHERE estado = "FALLIDA"'
        );
        res.json({ count: rows[0].count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// ENDPOINTS DE PRUEBA
// =====================================================

app.get('/prueba', (req, res) => {
    res.send('OK servidor funcionando');
});

// =====================================================
// INICIAR SERVIDOR
// =====================================================

app.listen(PORT, () => {
    console.log(`\n🍬 Sweet Dreams corriendo en http://localhost:${PORT}\n`);
    console.log('📊 Estado:');
    console.log(`   - BD Local: ${dbLocal ? '✅ Conectada' : '❌ Desconectada'}`);
    console.log(`   - BD Federada: ${dbFederated ? '✅ Conectada' : '⚠️ No disponible'}`);
    console.log(`   - Saga Pattern: ${txManager ? '✅ Activo' : '❌ Inactivo'}`);
    console.log(`   - Fecha local actual: ${getFechaLocal()}\n`);
});

// Manejo de cierre graceful
process.on('SIGINT', async () => {
    console.log('\n🛑 Cerrando conexiones...');
    if (dbLocal) dbLocal.end();
    if (dbFederated) dbFederated.end();
    process.exit(0);
});