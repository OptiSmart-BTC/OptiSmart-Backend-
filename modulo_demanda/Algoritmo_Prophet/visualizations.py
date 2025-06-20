import plotly.graph_objects as go
import os

def graficar_forecast(df_merged, dmd_unit, dmd_group, loc, output_folder):

    """Con esta función vamos a realizar una gráfica interactiva por cada una 
    de las combinaciones a las que le realizamos un forecast, comparando la 
    historia real con la predicha y además mostrando la predicción a futuro 
    visualmente
    
    Parametros:
    - Combinación especifica del producto que estamos prediciendo
    - Dataframe del forecast para graficar los resultados
    
    Salida:
    - Carpeta con archivos HTML de todas las gráficas"""

    fig = go.Figure()

    fig.add_trace(go.Scatter(x=df_merged.index, y=df_merged['y'], mode='lines+markers', name='Demanda Real', line=dict(color='blue')))

    fig.add_trace(go.Scatter(x=df_merged.index, y=df_merged['yhat'], mode='lines+markers', name='Demanda Predicha', line=dict(color ='red')))

    fig.update_layout(
        title = f'Forecast para {dmd_unit} - {dmd_group} - {loc}',
        xaxis_title = 'Fecha',
        yaxis_title = 'Demanda cantidad',
        legend_title = 'Leyenda',
        template = 'plotly_white'
    )

    # Guardar la gráfica
    file_name_html = f"{dmd_unit}_{dmd_group}_{loc}.html"
    fig.write_html(os.path.join(output_folder, file_name_html))
    print(f"Gráfica guardada para {dmd_unit}-{dmd_group}-{loc}")

