const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '', // ← Pon tu contraseña aquí
    database: 'sweets',
    port: 3306
});

db.connect((err) => {
    if (err) {
        console.error('❌ Error al conectar a MySQL:', err.message);
        process.exit(1);
    }
    console.log('✅ Conectado a MySQL - Base de datos: sweets');
});

function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
}
/*
// LOGIN
app.post('/api/login', async (req, res) => {
    const { usuario, password } = req.body;
    try {
        const rows = await query(
            'SELECT idEmpleado, nombre, apPat FROM empleado WHERE email = ? AND apPat = ?',
            [usuario, password]
        );
        if (rows.length > 0) {
            const emp = rows[0];
            res.json({ ok: true, nombre: `${emp.nombre} ${emp.apPat}`, id: emp.idEmpleado });
        } else {
            if (usuario === 'Admin' && password === 'admin') {
                res.json({ ok: true, nombre: 'Admin', id: 1 });
            } else {
                res.status(401).json({ ok: false, mensaje: 'Usuario o contraseña incorrectos' });
            }
        }
    } catch (err) {
        res.status(500).json({ ok: false, mensaje: 'Error del servidor' });
    }
});*/

// DULCES
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
            'INSERT INTO dulce (nombre, precio, stock, idTipoDulce) VALUES (?, ?, ?, ?)', [nombre, precio, stock, idTipoDulce]
        );
        const nuevo = await query('SELECT * FROM dulce WHERE idDulces = ?', [result.insertId]);
        res.status(201).json(nuevo[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/dulces/:id', async(req, res) => {
    const { nombre, precio, stock, idTipoDulce } = req.body;
    try {
        await query(
            'UPDATE dulce SET nombre=?, precio=?, stock=?, idTipoDulce=? WHERE idDulces=?', [nombre, precio, stock, idTipoDulce, req.params.id]
        );
        const updated = await query('SELECT * FROM dulce WHERE idDulces = ?', [req.params.id]);
        res.json(updated[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/dulces/:id', async(req, res) => {
    try {
        await query('DELETE FROM dulce WHERE idDulces = ?', [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// TIPOS
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
        res.status(201).json({ idTipoDulce: result.insertId, descripcionDulce });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// VENTAS
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

app.post('/api/ventas', async(req, res) => {
    const { items, empleado_nombre } = req.body;
    if (!items || items.length === 0)
        return res.status(400).json({ error: 'El carrito está vacío' });

    try {
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
        const fecha = new Date().toISOString().split('T')[0];

        const ventaResult = await query(
            'INSERT INTO venta (fecha, idEmpleado, idCliente, total) VALUES (?, ?, ?, ?)', [fecha, empleadoId, clienteId, total]
        );
        const idVenta = ventaResult.insertId;

        for (const item of items) {
            await query(
                'INSERT INTO detalleventa (cantidad, costo, idDulce, idVenta) VALUES (?, ?, ?, ?)', [item.cantidad, item.precio * item.cantidad, item.idDulce, idVenta]
            );
            await query(
                'UPDATE dulce SET stock = stock - ? WHERE idDulces = ?', [item.cantidad, item.idDulce]
            );
        }

        res.status(201).json({ ok: true, idVenta, total, fecha, cajero: empleado_nombre || 'Admin' });
    } catch (err) {
        console.error('Error registrando venta:', err);
        res.status(500).json({ error: err.message });
    }
});

// MÁS VENDIDOS
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

// CORTES
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
        const fecha = new Date().toISOString().split('T')[0];
        const result = await query(
            'INSERT INTO corteventa (fechaCorte, totalVentas, numVentas, createAt) VALUES (?, ?, ?, NOW())', [fecha, total, numVentas]
        );
        const idCorte = result.insertId;
        await query('UPDATE venta SET idCorteVenta = ? WHERE idCorteVenta IS NULL', [idCorte]);
        res.json({ ok: true, idCorte, total, numVentas, fecha });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`\n🍬 Sweet Dreams corriendo en http://localhost:${PORT}\n`);
});