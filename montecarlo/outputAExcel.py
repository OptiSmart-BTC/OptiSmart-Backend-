from datetime import timedelta
import pandas as pd
import math

from monteCarloSemModelo import calcular_demanda_y_simulacion_modelo
from monteCarloDia import calcular_demanda_y_simulacion_diaria
from monteCarloSem import calcular_demanda_y_simulacion_semanal
from evaluarSSMC import func_evaluar_safety_stocks
from shapiro_test import evaluar_normalidad

import pymongo
import sys

def calcular_puntaje(cob, mc_ss, exceso, ponderacion_cob, ponderacion_mc_ss, ponderacion_exceso):
    """
    Calcula un puntaje combinado para cobertura y nivel de servicio Monte Carlo.
    Cobertura: mejor cuanto más cerca de 0.
    MC_SS: mejor cuanto más cerca de 0.99, penalización si es 1.
    """
    # Penalización si MC_SS es exactamente 1
    penalizacion = 0 if mc_ss != 1 else 0.05
    penalizacion += 0.05 if cob == 1 else 0

    # Transformación de MC_SS para que sea mejor cuanto más cerca de 0.99
    #score_mc_ss = abs(mc_ss - 0.99) + penalizacion

    # Cálculo del puntaje combinado
    puntaje_total = (cob * ponderacion_cob) + (mc_ss * ponderacion_mc_ss) - penalizacion
    
    #puntaje_total = 1-puntaje_total

    return puntaje_total

def calcular_exceso_inventario(ss, avg_eval, max_eval):
    """
    Calcula el exceso de inventario como un valor entre 0 y 1.
    """
    if ss is None or max_eval == 0:
        return 0
    
    exceso = max(0, (float(ss) + float(avg_eval) - float(max_eval)) / float(max_eval))
    exceso = min(1, exceso)
    return 1-exceso




def conexion_url(db_user, db_password, host, port, db_name):
    return f"mongodb://{db_user}:{db_password}@{host}:{port}/?authSource=admin"

# Parámetros de conexión a MongoDB
db_name = sys.argv[1]
db_user = sys.argv[2]
db_password = sys.argv[3]
host = sys.argv[4]
port = sys.argv[5]

# Construir la URL de conexión
mongo_url = conexion_url(db_user, db_password, host, port, db_name)
client = pymongo.MongoClient(mongo_url)

# Conectar a la base de datos y a la colección
db = client[db_name]

# Ruta al archivo Excel adjunto
opti_data_path = db["ui_sem_all_pol_inv"]
hist_demanda = db['historico_demanda']
sku_datos = db['sku']
coleccionFecha = db['parametros_usuario']

# Filtrar los documentos que tienen 'Tipo' = "Horizontes"
horizontes = list(coleccionFecha.find({"Tipo": "Horizontes"}))

# Convertir los resultados en un DataFrame de pandas
df = pd.DataFrame(horizontes)

# Extraer 'Horizonte_Historico_dias' y 'Fecha_Fin_Horizonte'
horizonte_historico = df.loc[df['Num_Param'] == 1, 'Horizonte_Historico_dias'].values[0]
fecha_fin_horizonte_np = df.loc[df['Num_Param'] == 2, 'Fecha_Fin_Horizonte'].values[0]

# Convertir numpy.datetime64 a pandas datetime
fecha_fin_horizonte = pd.to_datetime(fecha_fin_horizonte_np)

# Calcular la fecha de inicio del horizonte restando los días
fecha_inicio_horizonte = fecha_fin_horizonte - timedelta(days=int(horizonte_historico))


#fecha_inicio = pd.to_datetime('15/10/2023', dayfirst=True)
#fecha_fin = pd.to_datetime('15/04/2024', dayfirst=True)
fecha_inicio_calc = fecha_inicio_horizonte.strftime('%d/%m/%Y')
fecha_fin_calc = fecha_fin_horizonte.strftime('%d/%m/%Y')
fecha_inicio_eval = fecha_inicio_horizonte.strftime('%d/%m/%Y')
fecha_fin_eval = fecha_fin_horizonte.strftime('%d/%m/%Y')

# Cargar el archivo
ss_data = pd.DataFrame(list(opti_data_path.find()))
data_hist = pd.DataFrame(list(hist_demanda.find()))
data_sku = pd.DataFrame(list(sku_datos.find()))

data_sku['SKU'] = data_sku['Producto'] + '@' + data_sku['Ubicacion']

data_hist['SKU'] = data_hist['Producto'] + '@' + data_hist['Ubicacion'] 
skus_con_datos = data_hist[data_hist['Cantidad'] > 0]['SKU'].unique()

# calcular data_hist pero solo con los datos de la fecha de inicio y fin de evaluacion
data_hist_eval = data_hist[(pd.to_datetime(data_hist['Fecha'], dayfirst=True) >= fecha_inicio_eval) & (pd.to_datetime(data_hist['Fecha'], dayfirst=True) <= fecha_fin_eval)]

num_skus = min(len(ss_data['SKU'].unique()), 1000)
skus_aleatorios = pd.Series(ss_data['SKU'].unique()).sample(n=num_skus, random_state=1).tolist()

skus_aleatorios = [sku for sku in skus_aleatorios if sku in skus_con_datos]

# Preparar DataFrame para resultados
resultados = pd.DataFrame(columns=['SKU','SS_Opti', 'SS_Semanal', 'SS_Diario', 'SS_Modelo', 'AVG_Sem_Calc', 'MAX_Sem_Calc', 'Num_0_Sem', '/','AVG_Sem_Eval', 'MAX_Sem_Eval', '//', 'Mejor Distribucion', 'P-value', 'Normal?', '///', 'Cob_Opti', 'Cob_Sem', 'Cob_Dia', 'Cob_Mod', '////', 'MC_SS_Opti', 'MC_SS_Sem', 'MC_SS_Dia', 'MC_SS_Mod', '/////', 'exceso_opti', 'exceso_sem', 'exceso_dia', 'exceso_mod', '//////', 'pts_opti', 'pts_sem', 'pts_dia', 'pts_mod', '///////', 'mejor'])

#skus_aleatorios = ['A00342@FARMACIA', 'A00015@FARMACIA', 'A00015@FARMACIA'] 
minimo_registros_necesarios = 1
for sku in skus_aleatorios: # para cada sku
    """
    Inicia seccion de calculo de SS
    """
    #
    # Ejecutar las tres funciones de simulación para el SKU actual
    #
    lead_time = data_sku[data_sku['SKU'] == sku]['LeadTime_Abasto_Dias'].values[0]
    lead_time_sem = math.ceil(lead_time / 7)
    
    if (data_hist_eval['SKU'] == sku).sum() >= minimo_registros_necesarios:
        
        
        diario = calcular_demanda_y_simulacion_diaria(hist_demanda, sku, 0.99, lead_time, 10000, fecha_inicio_calc, fecha_fin_calc)
        semanal, promedio, alto, cant_ceros = calcular_demanda_y_simulacion_semanal(hist_demanda, sku, 0.99, lead_time_sem, 10000, fecha_inicio_calc, fecha_fin_calc)
        modelo, best_fit = calcular_demanda_y_simulacion_modelo(hist_demanda, sku, 0.99, lead_time_sem, 10000, fecha_inicio_calc, fecha_fin_calc)
        p_value, es_normal = evaluar_normalidad(hist_demanda, sku, fecha_inicio_calc, fecha_fin_calc)
    else:
        # Si no hay suficientes datos, asignar None o un valor por defecto
        diario = None
        semanal = None
        modelo = None
        best_fit = None
        promedio = None
        alto = None
        cant_ceros = None
        p_value = None
        es_normal = None
            
    # Obtener el valor de SS_Cantidad (U_SS en este caso) para el SKU actual del archivo Excel
    ss_cantidad = ss_data[ss_data['SKU'] == sku]['SS_Cantidad'].values[0] if sku in ss_data['SKU'].values else None
    
    """
    Fin seccion calculo SS
    """
    
    """
    Inicia seccion de evaluacion
    """
    #calcular el alto y promedio semanal en el periodo de eval
    z1, promedio_eval, alto_eval, z2 = calcular_demanda_y_simulacion_semanal(hist_demanda, sku, 0.99, lead_time_sem, 10000, fecha_inicio_eval, fecha_fin_eval)
    
    #
    # Evaluar SS nivel de cobertura
    #
    if ss_cantidad is not None and ss_cantidad != 0 and alto_eval != 0:
        cob_opti = (float(ss_cantidad) + float(promedio_eval)) / float(alto_eval)
        if cob_opti > 1: cob_opti = 1
    else:
        cob_opti = None
    
    if semanal is None:
        cob_sem = None
    else:
        cob_sem = (semanal+promedio_eval)/alto_eval
        if cob_sem > 1: cob_sem = 1
    
    if diario is None:
        cob_dia = None
    else:
        cob_dia = (diario+promedio_eval)/alto_eval
        if cob_dia > 1: cob_dia = 1
    
    if modelo is None:
        cob_mod = None
    else:
        cob_mod = (modelo+promedio_eval)/alto_eval
        if cob_mod > 1: cob_mod = 1   
            
    #
    #Evaluar SS MC 2
    #
    safety_stocks = {
        'SS_Opti': ss_cantidad,
        'SS_Sem': semanal,
        'SS_Dia': diario,
        'SS_Mod': modelo
    }
    resultados_MC_SS = func_evaluar_safety_stocks(hist_demanda, sku, safety_stocks, 5000, lead_time_sem, fecha_inicio_eval, fecha_fin_eval)
    
    if ss_cantidad == 0 or ss_cantidad is None:
        resultados_MC_SS['SS_Opti'] = None
        
    #
    # Evaluar exceso de inventario
    #
    exceso_opti = calcular_exceso_inventario(ss_cantidad, promedio_eval, alto_eval)
    exceso_sem = calcular_exceso_inventario(semanal, promedio_eval, alto_eval)
    exceso_dia = calcular_exceso_inventario(diario, promedio_eval, alto_eval)
    exceso_mod = calcular_exceso_inventario(modelo, promedio_eval, alto_eval)

    
    ponderacion_cob = 0.15
    ponderacion_mc_ss = 0.5
    ponderacion_exceso = 0.35
    pts_opti = calcular_puntaje(cob_opti, resultados_MC_SS['SS_Opti'], exceso_opti, ponderacion_cob, ponderacion_mc_ss, ponderacion_exceso) if cob_opti is not None else None
    pts_sem = calcular_puntaje(cob_sem, resultados_MC_SS['SS_Sem'], exceso_sem, ponderacion_cob, ponderacion_mc_ss, ponderacion_exceso) if cob_sem is not None else None
    pts_dia = calcular_puntaje(cob_dia, resultados_MC_SS['SS_Dia'], exceso_dia, ponderacion_cob, ponderacion_mc_ss, ponderacion_exceso) if cob_dia is not None else None
    pts_mod = calcular_puntaje(cob_mod, resultados_MC_SS['SS_Mod'], exceso_mod, ponderacion_cob, ponderacion_mc_ss, ponderacion_exceso) if cob_mod is not None else None
    
    # Determinar cuál es el mejor modelo de SS (el que tenga mas puntos)
    puntos = [pts_opti, pts_sem, pts_dia, pts_mod]

    puntos_filtrados = [p for p in puntos if p is not None]
    
    mejor_puntos = max(puntos_filtrados) if puntos_filtrados else None
    if mejor_puntos == pts_opti:
        mejor_modelo_ss = 'Opti'
    elif mejor_puntos == pts_sem:
        mejor_modelo_ss = 'Sem'
    elif mejor_puntos == pts_dia:
        mejor_modelo_ss = 'Dia'
    else:
        mejor_modelo_ss = 'Mod'
        
    if mejor_puntos is None:
        mejor_modelo_ss = 'Ninguno'
        
    """
    Fin seccion de evaluacion
    """
    
    #
    # agregar al dataframe de excel    
    #
    new = pd.DataFrame({'SKU': [sku], 'SS_Opti': [ss_cantidad], 'SS_Semanal': [semanal], 'SS_Diario': [diario], 'SS_Modelo': [modelo], 'AVG_Sem_Calc': [promedio], 'MAX_Sem_Calc': [alto], 'Num_0_Sem': [cant_ceros], '/': None, 'AVG_Sem_Eval': [promedio_eval], 'MAX_Sem_Eval': [alto_eval],'//': None, 'Mejor Distribucion': [best_fit], 'P-value': [p_value], 'Normal?': [es_normal], '///': None, 'Cob_Opti':[cob_opti], 'Cob_Sem':[cob_sem], 'Cob_Dia':[cob_dia], 'Cob_Mod':[cob_mod], '////': None, 'MC_SS_Opti': [resultados_MC_SS['SS_Opti']], 'MC_SS_Sem': [resultados_MC_SS['SS_Sem']], 'MC_SS_Dia': [resultados_MC_SS['SS_Dia']], 'MC_SS_Mod': [resultados_MC_SS['SS_Mod']], '/////': None, 'exceso_opti':exceso_opti, 'exceso_sem':exceso_sem, 'exceso_dia':exceso_dia, 'exceso_mod':exceso_mod, '//////': None, 'pts_opti': [pts_opti], 'pts_sem': [pts_sem], 'pts_dia': [pts_dia], 'pts_mod': [pts_mod], '///////': None, 'mejor': [mejor_modelo_ss]})
    resultados = pd.concat([resultados, new], ignore_index=True)
    
# Guardar los resultados en MongoDB en lugar de un archivo Excel
# Convertimos el DataFrame a un formato de diccionarios que MongoDB acepta
resultados_dict = resultados.to_dict("records")

# Nombre de la colección donde quieres guardar los resultados
coleccion_resultados = db["resultados_simulaciones"]

coleccion_resultados.delete_many({})

# Insertar los datos en la colección, si no existe MongoDB la creará automáticamente
coleccion_resultados.insert_many(resultados_dict)
print("se guardo el archivo resultados_simulaciones.xlsx")