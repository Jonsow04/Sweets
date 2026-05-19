// SweetsFederatedTransactionManager.js
const mysql = require('mysql2/promise');

/**
 * CLASE PARA CONTROL DE TRANSACCIONES CON TABLAS FEDERADAS
 * Para el sistema SWEETS - Manejo de consistencia sin transacciones reales
 * 
 * Versión Node.js - Traducida del código PHP original
 */
class SweetsFederatedTransactionManager {
    constructor(poolLocal, poolFederated, sagaLogTable = 'saga_log_federated') {
        this.poolLocal = poolLocal;        // Pool de conexión a BD local (sweets)
        this.poolFederated = poolFederated; // Pool de conexión a BD federada
        this.sagaLogTable = sagaLogTable;
        this.maxRetries = 5;
        this.retryDelay = 100; // milisegundos (0.1 segundos)
        
        // Inicializar la tabla de log automáticamente
        this.initSagaLogTable();
    }
    
    /**
     * Crea tabla de log para el patrón Saga
     */
    async initSagaLogTable() {
        const sql = `CREATE TABLE IF NOT EXISTS ${this.sagaLogTable} (
            id_saga INT AUTO_INCREMENT PRIMARY KEY,
            saga_id VARCHAR(50) NOT NULL,
            operacion VARCHAR(50) NOT NULL,
            tabla VARCHAR(50) NOT NULL,
            registro_id INT NULL,
            datos_originales JSON NULL,
            datos_nuevos JSON NULL,
            estado VARCHAR(20) DEFAULT 'PENDIENTE',
            error_mensaje TEXT NULL,
            intentos INT DEFAULT 0,
            fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            fecha_compensacion TIMESTAMP NULL,
            INDEX idx_saga_id (saga_id),
            INDEX idx_estado (estado)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
        
        try {
            await this.poolLocal.execute(sql);
            console.log('✅ Tabla saga_log_federated inicializada');
        } catch (error) {
            console.error('❌ Error al crear tabla saga_log:', error.message);
        }
    }
    
    /**
     * =====================================================
     * OPERACIONES CON TABLAS FEDERADAS CON REINTENTOS
     * =====================================================
     */
    
    /**
     * Verifica si un registro ya existe en tabla federada (para idempotencia)
     */
    async existsInFederated(table, datos) {
        const primerCampo = Object.keys(datos)[0];
        const primerValor = datos[primerCampo];
        
        try {
            const [rows] = await this.poolFederated.execute(
                `SELECT 1 FROM ${table} WHERE ${primerCampo} = ? LIMIT 1`,
                [primerValor]
            );
            return rows.length > 0;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Registra una operación en el log Saga
     */
    async logSagaOperation(sagaId, operacion, tabla, registroId, datosOriginales, datosNuevos, estado, error = null, intentos = 0) {
        const sql = `INSERT INTO ${this.sagaLogTable} 
                    (saga_id, operacion, tabla, registro_id, datos_originales, datos_nuevos, estado, error_mensaje, intentos)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        await this.poolLocal.execute(sql, [
            sagaId,
            operacion,
            tabla,
            registroId,
            datosOriginales ? JSON.stringify(datosOriginales) : null,
            datosNuevos ? JSON.stringify(datosNuevos) : null,
            estado,
            error,
            intentos
        ]);
    }
    
    /**
     * Inserta en tabla federada con reintentos automáticos
     */
    async federatedInsert(table, datos, sagaId = null) {
        sagaId = sagaId || `saga_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        let registroId = null;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                // Verificar si ya existe (operación idempotente)
                if (await this.existsInFederated(table, datos)) {
                    return {
                        success: true,
                        message: 'Registro ya existe (idempotente)',
                        saga_id: sagaId,
                        attempt: attempt
                    };
                }
                
                // Construir INSERT
                const columns = Object.keys(datos);
                const placeholders = columns.map(() => '?').join(', ');
                const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
                
                const [result] = await this.poolFederated.execute(sql, Object.values(datos));
                registroId = result.insertId;
                
                // Registrar en log Saga
                await this.logSagaOperation(sagaId, 'INSERT', table, registroId, null, datos, 'COMPLETADA', null, attempt);
                
                return {
                    success: true,
                    id: registroId,
                    saga_id: sagaId,
                    attempt: attempt
                };
                
            } catch (error) {
                await this.logSagaOperation(sagaId, 'INSERT', table, registroId, null, datos, 'FALLIDA', error.message, attempt);
                
                if (attempt === this.maxRetries) {
                    return {
                        success: false,
                        error: `Error después de ${attempt} intentos: ${error.message}`,
                        saga_id: sagaId
                    };
                }
                
                // Backoff exponencial
                await this.sleep(this.retryDelay * attempt);
            }
        }
        
        return { success: false, error: 'Max retries exceeded', saga_id: sagaId };
    }
    
    /**
     * Actualiza en tabla federada con reintentos y control de versión
     */
    async federatedUpdate(table, id, datos, campoId = 'id', sagaId = null) {
        sagaId = sagaId || `saga_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        let datosOriginales = null;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                // Obtener datos originales primero (para posible compensación)
                if (datosOriginales === null) {
                    const [rows] = await this.poolFederated.execute(
                        `SELECT * FROM ${table} WHERE ${campoId} = ?`,
                        [id]
                    );
                    
                    if (rows.length === 0) {
                        return { success: false, error: 'Registro no encontrado', saga_id: sagaId };
                    }
                    datosOriginales = rows[0];
                }
                
                // Construir UPDATE
                const sets = [];
                const params = [];
                for (const [campo, valor] of Object.entries(datos)) {
                    sets.push(`${campo} = ?`);
                    params.push(valor);
                }
                params.push(id);
                
                const sql = `UPDATE ${table} SET ${sets.join(', ')} WHERE ${campoId} = ?`;
                const [result] = await this.poolFederated.execute(sql, params);
                
                // Verificar que se actualizó
                if (result.affectedRows === 0 && attempt < this.maxRetries) {
                    throw new Error('No se actualizó ninguna fila, reintentando...');
                }
                
                // Registrar en log Saga
                await this.logSagaOperation(sagaId, 'UPDATE', table, id, datosOriginales, datos, 'COMPLETADA', null, attempt);
                
                return {
                    success: true,
                    saga_id: sagaId,
                    attempt: attempt
                };
                
            } catch (error) {
                await this.logSagaOperation(sagaId, 'UPDATE', table, id, datosOriginales, datos, 'FALLIDA', error.message, attempt);
                
                if (attempt === this.maxRetries) {
                    return {
                        success: false,
                        error: `Error después de ${attempt} intentos: ${error.message}`,
                        saga_id: sagaId
                    };
                }
                
                await this.sleep(this.retryDelay * attempt);
            }
        }
        
        return { success: false, error: 'Max retries exceeded', saga_id: sagaId };
    }
    
    /**
     * Elimina en tabla federada (marcado lógico recomendado)
     */
    async federatedDelete(table, id, campoId = 'id', sagaId = null) {
        sagaId = sagaId || `saga_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        let datosOriginales = null;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                // Obtener datos originales antes de eliminar
                const [rows] = await this.poolFederated.execute(
                    `SELECT * FROM ${table} WHERE ${campoId} = ?`,
                    [id]
                );
                
                if (rows.length === 0) {
                    return { success: false, error: 'Registro no encontrado', saga_id: sagaId };
                }
                datosOriginales = rows[0];
                
                await this.poolFederated.execute(`DELETE FROM ${table} WHERE ${campoId} = ?`, [id]);
                
                await this.logSagaOperation(sagaId, 'DELETE', table, id, datosOriginales, null, 'COMPLETADA', null, attempt);
                
                return {
                    success: true,
                    saga_id: sagaId,
                    attempt: attempt
                };
                
            } catch (error) {
                await this.logSagaOperation(sagaId, 'DELETE', table, id, datosOriginales, null, 'FALLIDA', error.message, attempt);
                
                if (attempt === this.maxRetries) {
                    return { success: false, error: error.message, saga_id: sagaId };
                }
                
                await this.sleep(this.retryDelay * attempt);
            }
        }
        
        return { success: false, error: 'Max retries exceeded', saga_id: sagaId };
    }
    
    /**
     * =====================================================
     * OPERACIONES COMPUESTAS (SAGA PATTERN)
     * =====================================================
     */
    
    /**
     * Compensa operaciones fallidas (deshace lo hecho)
     */
    async compensateSaga(operacionesEjecutadas, sagaId) {
        // Ejecutar en orden inverso
        for (const operacion of operacionesEjecutadas.reverse()) {
            try {
                switch (operacion.tipo) {
                    case 'INSERT':
                        // Eliminar el registro insertado
                        const campoId = operacion.campoId || 'id';
                        const id = operacion.resultado?.id;
                        if (id) {
                            await this.federatedDelete(operacion.tabla, id, campoId, `${sagaId}_comp`);
                        }
                        break;
                        
                    case 'UPDATE':
                        // Restaurar datos originales
                        if (operacion.datos_originales) {
                            await this.federatedUpdate(
                                operacion.tabla,
                                operacion.id,
                                operacion.datos_originales,
                                operacion.campoId || 'id',
                                `${sagaId}_comp`
                            );
                        }
                        break;
                        
                    case 'DELETE':
                        // Restaurar registro eliminado
                        if (operacion.datos_originales) {
                            await this.federatedInsert(
                                operacion.tabla,
                                operacion.datos_originales,
                                `${sagaId}_comp`
                            );
                        }
                        break;
                }
                
                // Marcar compensación en log
                await this.markCompensated(sagaId, operacion);
                
            } catch (error) {
                console.error(`Saga Compensation Error - Saga: ${sagaId}, Error: ${error.message}`);
            }
        }
    }
    
    /**
     * Marca una operación como compensada en el log
     */
    async markCompensated(sagaId, operacion) {
        const sql = `UPDATE ${this.sagaLogTable} 
                    SET estado = 'COMPENSADA', fecha_compensacion = NOW()
                    WHERE saga_id = ? AND operacion = ? AND tabla = ? AND registro_id = ?`;
        
        const registroId = operacion.resultado?.id || operacion.id || null;
        await this.poolLocal.execute(sql, [sagaId, operacion.tipo, operacion.tabla, registroId]);
    }
    
    /**
     * Ejecuta múltiples operaciones federadas como una "transacción lógica"
     * Si una falla, intenta compensar las anteriores
     */
    async executeSagaTransaction(operaciones, sagaId = null) {
        sagaId = sagaId || `saga_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const ejecutadas = [];
        
        for (let index = 0; index < operaciones.length; index++) {
            const operacion = operaciones[index];
            let resultado = null;
            
            switch (operacion.tipo) {
                case 'INSERT':
                    resultado = await this.federatedInsert(
                        operacion.tabla,
                        operacion.datos,
                        sagaId
                    );
                    break;
                    
                case 'UPDATE':
                    resultado = await this.federatedUpdate(
                        operacion.tabla,
                        operacion.id,
                        operacion.datos,
                        operacion.campoId || 'id',
                        sagaId
                    );
                    break;
                    
                case 'DELETE':
                    resultado = await this.federatedDelete(
                        operacion.tabla,
                        operacion.id,
                        operacion.campoId || 'id',
                        sagaId
                    );
                    break;
            }
            
            if (!resultado.success) {
                // Compensar operaciones ya ejecutadas
                await this.compensateSaga(ejecutadas, sagaId);
                
                return {
                    success: false,
                    saga_id: sagaId,
                    failed_at: index,
                    error: resultado.error,
                    compensated: true
                };
            }
            
            ejecutadas.push({
                ...operacion,
                resultado: resultado,
                datos_originales: operacion.datos_originales || null
            });
        }
        
        return {
            success: true,
            saga_id: sagaId,
            operations: operaciones.length,
            message: 'Transacción federada completada exitosamente'
        };
    }
    
    /**
     * =====================================================
     * OPERACIONES ESPECÍFICAS PARA TUS TABLAS FEDERADAS
     * =====================================================
     */
    
    /**
     * Sincronizar dulce local -> dulceFED
     */
    async syncDulceToFederated(idDulce, sagaId = null) {
        // Obtener datos desde BD local
        const [rows] = await this.poolLocal.execute('SELECT * FROM dulce WHERE idDulces = ?', [idDulce]);
        
        if (rows.length === 0) {
            return { success: false, error: 'Dulce no encontrado en BD local' };
        }
        
        const dulce = rows[0];
        
        // Transformar a nombres de campos de la tabla federada
        const datosFederados = {
            idDulces: dulce.idDulces,
            nombre: dulce.nombre,
            precio: dulce.precio,
            stock: dulce.stock,
            idTipoDulce: dulce.idTipoDulce
        };
        
        // Verificar si existe en federada
        const [existe] = await this.poolFederated.execute(
            'SELECT idDulces FROM dulceFED WHERE idDulces = ?',
            [idDulce]
        );
        
        if (existe.length > 0) {
            return await this.federatedUpdate('dulceFED', idDulce, datosFederados, 'idDulces', sagaId);
        } else {
            return await this.federatedInsert('dulceFED', datosFederados, sagaId);
        }
    }
    
    /**
     * Sincronizar empleado local -> empleadoFED
     */
    async syncEmpleadoToFederated(idEmpleado, sagaId = null) {
        const [rows] = await this.poolLocal.execute('SELECT * FROM empleado WHERE idEmpleado = ?', [idEmpleado]);
        
        if (rows.length === 0) {
            return { success: false, error: 'Empleado no encontrado en BD local' };
        }
        
        const empleado = rows[0];
        
        const datosFederados = {
            idEmpleado: empleado.idEmpleado,
            nombre: empleado.nombre,
            apPat: empleado.apPat,
            apMat: empleado.apMat,
            email: empleado.email,
            idPuestoEmpleado: empleado.idPuestoEmpleado
        };
        
        const [existe] = await this.poolFederated.execute(
            'SELECT idEmpleado FROM empleadoFED WHERE idEmpleado = ?',
            [idEmpleado]
        );
        
        if (existe.length > 0) {
            return await this.federatedUpdate('empleadoFED', idEmpleado, datosFederados, 'idEmpleado', sagaId);
        } else {
            return await this.federatedInsert('empleadoFED', datosFederados, sagaId);
        }
    }
    
    /**
     * Sincronizar puesto empleado local -> puestoEmpleadoFED
     */
    async syncPuestoToFederated(idPuesto, sagaId = null) {
        const [rows] = await this.poolLocal.execute('SELECT * FROM puestoEmpleado WHERE idPuestoEmpleado = ?', [idPuesto]);
        
        if (rows.length === 0) {
            return { success: false, error: 'Puesto no encontrado en BD local' };
        }
        
        const puesto = rows[0];
        
        const datosFederados = {
            idPuestoEmpleado: puesto.idPuestoEmpleado,
            nombrePuesto: puesto.nombrePuesto,
            salario: puesto.salario,
            horario: puesto.horario,
            descripcion: puesto.descripcion
        };
        
        const [existe] = await this.poolFederated.execute(
            'SELECT idPuestoEmpleado FROM puestoEmpleadoFED WHERE idPuestoEmpleado = ?',
            [idPuesto]
        );
        
        if (existe.length > 0) {
            return await this.federatedUpdate('puestoEmpleadoFED', idPuesto, datosFederados, 'idPuestoEmpleado', sagaId);
        } else {
            return await this.federatedInsert('puestoEmpleadoFED', datosFederados, sagaId);
        }
    }
    
    /**
     * Sincronizar tipo dulce local -> tipoDulceFED
     */
    async syncTipoDulceToFederated(idTipoDulce, sagaId = null) {
        const [rows] = await this.poolLocal.execute('SELECT * FROM tipoDulce WHERE idTipoDulce = ?', [idTipoDulce]);
        
        if (rows.length === 0) {
            return { success: false, error: 'Tipo de dulce no encontrado en BD local' };
        }
        
        const tipo = rows[0];
        
        const datosFederados = {
            idTipoDulce: tipo.idTipoDulce,
            descripcionDulce: tipo.descripcionDulce
        };
        
        const [existe] = await this.poolFederated.execute(
            'SELECT idTipoDulce FROM tipoDulceFED WHERE idTipoDulce = ?',
            [idTipoDulce]
        );
        
        if (existe.length > 0) {
            return await this.federatedUpdate('tipoDulceFED', idTipoDulce, datosFederados, 'idTipoDulce', sagaId);
        } else {
            return await this.federatedInsert('tipoDulceFED', datosFederados, sagaId);
        }
    }
    
    /**
     * Sincronización masiva (todas las tablas)
     */
    async syncAllToFederated(ids = null) {
        const resultados = {
            dulces: [],
            empleados: [],
            puestos: [],
            tipos_dulce: []
        };
        
        const sagaId = `sync_all_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Sincronizar tipos de dulce primero (por FK)
        let tipos = ids?.tipos || null;
        if (tipos === null) {
            const [rows] = await this.poolLocal.query('SELECT idTipoDulce FROM tipoDulce');
            tipos = rows.map(r => r.idTipoDulce);
        }
        
        for (const id of tipos) {
            resultados.tipos_dulce.push(await this.syncTipoDulceToFederated(id, sagaId));
        }
        
        // Sincronizar puestos
        let puestos = ids?.puestos || null;
        if (puestos === null) {
            const [rows] = await this.poolLocal.query('SELECT idPuestoEmpleado FROM puestoEmpleado');
            puestos = rows.map(r => r.idPuestoEmpleado);
        }
        
        for (const id of puestos) {
            resultados.puestos.push(await this.syncPuestoToFederated(id, sagaId));
        }
        
        // Sincronizar empleados
        let empleados = ids?.empleados || null;
        if (empleados === null) {
            const [rows] = await this.poolLocal.query('SELECT idEmpleado FROM empleado');
            empleados = rows.map(r => r.idEmpleado);
        }
        
        for (const id of empleados) {
            resultados.empleados.push(await this.syncEmpleadoToFederated(id, sagaId));
        }
        
        // Sincronizar dulces
        let dulces = ids?.dulces || null;
        if (dulces === null) {
            const [rows] = await this.poolLocal.query('SELECT idDulces FROM dulce');
            dulces = rows.map(r => r.idDulces);
        }
        
        for (const id of dulces) {
            resultados.dulces.push(await this.syncDulceToFederated(id, sagaId));
        }
        
        return {
            success: true,
            saga_id: sagaId,
            resultados: resultados
        };
    }
    
    /**
     * =====================================================
     * MÉTODOS AUXILIARES
     * =====================================================
     */
    
    /**
     * Sleep helper para reintentos
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Obtiene el estado de una saga
     */
    async getSagaStatus(sagaId) {
        const [rows] = await this.poolLocal.execute(
            `SELECT * FROM ${this.sagaLogTable} WHERE saga_id = ?`,
            [sagaId]
        );
        return rows;
    }
    
    /**
     * Reintenta operaciones fallidas pendientes
     */
    async retryFailedOperations() {
        const [fallidas] = await this.poolLocal.execute(
            `SELECT * FROM ${this.sagaLogTable} WHERE estado = 'FALLIDA' AND intentos < ?`,
            [this.maxRetries]
        );
        
        const resultados = [];
        for (const fallida of fallidas) {
            const datos = fallida.datos_nuevos ? JSON.parse(fallida.datos_nuevos) : {};
            let res;
            
            switch (fallida.operacion) {
                case 'INSERT':
                    res = await this.federatedInsert(fallida.tabla, datos, fallida.saga_id);
                    break;
                case 'UPDATE':
                    res = await this.federatedUpdate(fallida.tabla, fallida.registro_id, datos, 'id', fallida.saga_id);
                    break;
                case 'DELETE':
                    res = await this.federatedDelete(fallida.tabla, fallida.registro_id, 'id', fallida.saga_id);
                    break;
                default:
                    res = { success: false, error: 'Operación desconocida' };
            }
            
            resultados.push({
                saga_id: fallida.saga_id,
                operacion: fallida.operacion,
                success: res.success
            });
        }
        
        return resultados;
    }
}

module.exports = SweetsFederatedTransactionManager;