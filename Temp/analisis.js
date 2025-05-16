
=SI(
    O(Override_Min_Politica_Inventarios<>"",Override_Max_Politica_Inventarios<>""),
    SI(
        Tipo_Override="SS",
        SS_Cantidad+Prom_LT*Demanda_Promedio_Semanal/7,
        SI(
            SS_Cantidad>0,
            SS_Cantidad+Prom_LT*Demanda_Promedio_Semanal/7,
            SI(
                Medida_Override="Cantidad",
                Override_Max_Politica_Inventarios,
                Override_Max_Politica_Inventarios*Demanda_Promedio_Semanal/7
            )
        )
    ),
    SS_Cantidad+Prom_LT*Demanda_Promedio_Semanal/7
)










=SI(
    O(Override_Max_Politica_Inventarios<>"",Override_Min_Politica_Inventarios<>""),
    SI(
        Tipo_Override="SS",
        SI(
            Medida_Override="Cantidad",
            SI(
                Y(Override_Max_Politica_Inventarios<>"",Override_Max_Politica_Inventarios<STAT_SS),
                Override_Max_Politica_Inventarios,
                SI(
                    Override_Min_Politica_Inventarios>STAT_SS,
                    Override_Min_Politica_Inventarios,
                    STAT_SS
                )
            ),
            SI(
                Y(Override_Max_Politica_Inventarios<>"",Override_Max_Politica_Inventarios*Demanda_Promedio_Semanal/7<STAT_SS),
                Override_Max_Politica_Inventarios*Demanda_Promedio_Semanal/7,
                SI(
                    Override_Min_Politica_Inventarios*Demanda_Promedio_Semanal/7>STAT_SS,Override_Min_Politica_Inventarios*Demanda_Promedio_Semanal/7,STAT_SS
                )
            )
        ),
        MAX(
            0,
            SI(
                Medida_Override="Cantidad",
                SI(
                    Y(Override_Max_Politica_Inventarios<>"",Override_Max_Politica_Inventarios-Prom_LT*Demanda_Promedio_Semanal/7<STAT_SS),
                    Override_Max_Politica_Inventarios-Prom_LT*Demanda_Promedio_Semanal/7,
                    SI(
                        Override_Min_Politica_Inventarios-Prom_LT*Demanda_Promedio_Semanal/7>STAT_SS,
                        Override_Min_Politica_Inventarios-Prom_LT*Demanda_Promedio_Semanal/7,
                        STAT_SS
                    )
                ),
                SI(
                    Y(Override_Max_Politica_Inventarios<>"",Override_Max_Politica_Inventarios*Demanda_Promedio_Semanal/7-Prom_LT*Demanda_Promedio_Semanal/7<STAT_SS),
                    Override_Max_Politica_Inventarios*Demanda_Promedio_Semanal/7-Prom_LT*Demanda_Promedio_Semanal/7,
                    SI(
                        Override_Min_Politica_Inventarios*Demanda_Promedio_Semanal/7-Prom_LT*Demanda_Promedio_Semanal/7>STAT_SS,
                        Override_Min_Politica_Inventarios*Demanda_Promedio_Semanal/7-Prom_LT*Demanda_Promedio_Semanal/7,
                        STAT_SS
                    )
                )
            )
        )
    ),
    STAT_SS
)