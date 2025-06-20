from pymongo import MongoClient
import pandas as pd
import sys
import os


def obtener_datos_desde_mongo(mongo_uri, db_name, collection_name):
    """Función para conectarse a MongoDB y obtener los datos"""
    client = MongoClient(mongo_uri)  # Usar la URI completa de MongoDB
    db = client[db_name]  # Base de datos dinámica

    # Leer la colección que depende del cliente
    collection = db[collection_name]
    data = list(collection.find())

    # Convertir los datos a un DataFrame de pandas
    df_historico = pd.DataFrame(data)
    return df_historico, db

def limpiar_versiones_antiguas(db, max_versions=4):
    """Eliminar corridas antiguas completas en demand_forecast, manteniendo solo las últimas max_versions."""
    collection = db.demand_forecast

    # Agrupar por combinación y obtener las corridas únicas (basadas en forecast_date)
    combinaciones = collection.aggregate([
        {
            "$group": {
                "_id": {"Producto": "$Producto", "Canal": "$Canal", "Ubicacion": "$Ubicacion"},
                "forecast_dates": {"$addToSet": "$forecast_date"},  # Usar forecast_date como identificador único de corrida
            }
        }
    ])

    for combinacion in combinaciones:
        # Ordenar las fechas de forecast en orden ascendente
        forecast_dates = sorted(combinacion["forecast_dates"])
        
        # Verificar si hay más corridas de las permitidas
        if len(forecast_dates) > max_versions:
            # Seleccionar las fechas más antiguas para eliminar
            fechas_a_eliminar = forecast_dates[:len(forecast_dates) - max_versions]

            # Eliminar todas las corridas con forecast_date en las fechas seleccionadas
            collection.delete_many({
                "Producto": combinacion["_id"]["Producto"],
                "Canal": combinacion["_id"]["Canal"],
                "Ubicacion": combinacion["_id"]["Ubicacion"],
                "forecast_date": {"$in": fechas_a_eliminar}
            })

            # Mensaje de depuración
            print(f"Eliminadas {len(fechas_a_eliminar)} corridas antiguas para la combinación: "
                  f"{combinacion['_id']}")

def subir_demand_forecast(datos_futuros_mongo_df, db):
    # Convertir el DataFrame a un diccionario y subir a la colección demand_forecast
    data_dict = datos_futuros_mongo_df.to_dict('records')
    db.demand_forecast.insert_many(data_dict)

    # Limpiar versiones antiguas
    limpiar_versiones_antiguas(db)

def subir_metricas(df_metricas, db):
    # Convertir las métricas a diccionario y subir a la colección metricas_resultados
    metricas_dict = df_metricas.to_dict('records')
    db.metricas_resultados.insert_many(metricas_dict)


def main(db_name, collection_name, mongo_uri, min_registros, max_porcentaje_ceros, periodo_a_predecir):

    df_historico, db = obtener_datos_desde_mongo(mongo_uri, db_name, collection_name)

    # Importar la función ejecutar_pipeline del script de pipeline
    from pipeline_prophet import ejecutar_pipeline

    # Ejecutar el pipeline y obtener los resultados
    datos_futuros_mongo_df, df_metricas = ejecutar_pipeline(
        df_historico, min_registros, max_porcentaje_ceros, periodo_a_predecir
    )

    # Subir los resultados a MongoDB
    subir_demand_forecast(datos_futuros_mongo_df, db)
    subir_metricas(df_metricas, db)
   

if __name__ == '__main__':
    script_dir = os.path.dirname(__file__)
    log_path = os.path.join(script_dir, 'prophet_python.log')
    sys.stdout = open(log_path, 'w')
    sys.stderr = sys.stdout
    mongo_uri = sys.argv[3]
    db_name = sys.argv[1]
    collection_name = sys.argv[2]
    min_registros = int(sys.argv[4])
    max_porcentaje_ceros = float(sys.argv[5])
    periodo_a_predecir = int(sys.argv[6])

    main(db_name, collection_name, mongo_uri, min_registros, max_porcentaje_ceros, periodo_a_predecir)
