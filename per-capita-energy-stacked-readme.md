# Per capita primary energy consumption by source - Data package

This data package contains the data that powers the chart ["Per capita primary energy consumption by source"](https://ourworldindata.org/grapher/per-capita-energy-stacked?v=1&csvType=full&useColumnShortNames=false) on the Our World in Data website.

## CSV Structure

The high level structure of the CSV file is that each row is an observation for an entity (usually a country or region) and a timepoint (usually a year).

The first two columns in the CSV file are "Entity" and "Code". "Entity" is the name of the entity (e.g. "United States"). "Code" is the OWID internal entity code that we use if the entity is a country or region. For most countries, this is the same as the [iso alpha-3](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-3) code of the entity (e.g. "USA") - for non-standard countries like historical countries these are custom codes.

The third column is either "Year" or "Day". If the data is annual, this is "Year" and contains only the year as an integer. If the column is "Day", the column contains a date string in the form "YYYY-MM-DD".

The remaining columns are the data columns, each of which is a time series. If the CSV data is downloaded using the "full data" option, then each column corresponds to one time series below. If the CSV data is downloaded using the "only selected data visible in the chart" option then the data columns are transformed depending on the chart type and thus the association with the time series might not be as straightforward.


## Metadata.json structure

The .metadata.json file contains metadata about the data package. The "charts" key contains information to recreate the chart, like the title, subtitle etc.. The "columns" key contains information about each of the columns in the csv, like the unit, timespan covered, citation for the data etc..

## About the data

Our World in Data is almost never the original producer of the data - almost all of the data we use has been compiled by others. If you want to re-use data, it is your responsibility to ensure that you adhere to the sources' license and to credit them correctly. Please note that a single time series may have more than one source - e.g. when we stich together data from different time periods by different producers or when we calculate per capita metrics using population data from a second source.

### How we process data at Our World In Data
All data and visualizations on Our World in Data rely on data sourced from one or several original data providers. Preparing this original data involves several processing steps. Depending on the data, this can include standardizing country names and world region definitions, converting units, calculating derived indicators such as per capita measures, as well as adding or adapting metadata such as the name or the description given to an indicator.
[Read about our data pipeline](https://docs.owid.io/projects/etl/)

## Detailed information about each time series


## Coal consumption per capita
Measured in [kilowatt-hours](#dod:watt-hours) per person.
Last updated: June 27, 2025  
Next update: June 2026  
Date range: 1965–2024  
Unit: kilowatt-hours  


### How to cite this data

#### In-line citation
If you have limited space (e.g. in data visualizations), you can use this abbreviated in-line citation:  
Energy Institute - Statistical Review of World Energy (2025); Population based on various sources (2024) – with major processing by Our World in Data

#### Full citation
Energy Institute - Statistical Review of World Energy (2025); Population based on various sources (2024) – with major processing by Our World in Data. “Coal consumption per capita” [dataset]. Energy Institute, “Statistical Review of World Energy”; Various sources, “Population” [original data].
Source: Energy Institute - Statistical Review of World Energy (2025), Population based on various sources (2024) – with major processing by Our World In Data

### What you should know about this data
* Includes commercial solid fuels only, i.e. bituminous coal and anthracite (hard coal), and lignite and brown (sub-bituminous) coal, and other commercial solid fuels. Excludes coal converted to liquid or gaseous fuels, but includes coal consumed in transformation processes. Differences between the consumption figures and the world production statistics are accounted for by stock changes, and unavoidable disparities in the definition, measurement or conversion of coal supply and demand data.

### Sources

#### Energy Institute – Statistical Review of World Energy
Retrieved on: 2025-06-27  
Retrieved from: https://www.energyinst.org/statistical-review/  

#### Various sources – Population
Retrieved on: 2024-07-11  
Retrieved from: https://ourworldindata.org/population-sources  

#### Notes on our processing step for this indicator
Per capita figures are calculated by dividing by a population dataset that is built and maintained by Our World in Data, based on [different sources](https://ourworldindata.org/population-sources).


## Oil consumption per capita
Measured in [kilowatt-hours](#dod:watt-hours) per person.
Last updated: June 27, 2025  
Next update: June 2026  
Date range: 1965–2024  
Unit: kilowatt-hours  


### How to cite this data

#### In-line citation
If you have limited space (e.g. in data visualizations), you can use this abbreviated in-line citation:  
Energy Institute - Statistical Review of World Energy (2025); Population based on various sources (2024) – with major processing by Our World in Data

#### Full citation
Energy Institute - Statistical Review of World Energy (2025); Population based on various sources (2024) – with major processing by Our World in Data. “Oil consumption per capita” [dataset]. Energy Institute, “Statistical Review of World Energy”; Various sources, “Population” [original data].
Source: Energy Institute - Statistical Review of World Energy (2025), Population based on various sources (2024) – with major processing by Our World In Data

### What you should know about this data
* Includes inland demand plus international aviation and marine bunkers and refinery fuel and loss. Consumption of biogasoline (such as ethanol) and biodiesel are excluded while derivatives of coal and natural gas are included. Differences between the world consumption figures and world production statistics are accounted for by stock changes, consumption of non-petroleum additives and substitute fuels and unavoidable disparities in the definition, measurement or conversion of oil supply and demand data.

### Sources

#### Energy Institute – Statistical Review of World Energy
Retrieved on: 2025-06-27  
Retrieved from: https://www.energyinst.org/statistical-review/  

#### Various sources – Population
Retrieved on: 2024-07-11  
Retrieved from: https://ourworldindata.org/population-sources  

#### Notes on our processing step for this indicator
Per capita figures are calculated by dividing by a population dataset that is built and maintained by Our World in Data, based on [different sources](https://ourworldindata.org/population-sources).


## Gas consumption per capita
Measured in [kilowatt-hours](#dod:watt-hours) per person.
Last updated: June 27, 2025  
Next update: June 2026  
Date range: 1965–2024  
Unit: kilowatt-hours  


### How to cite this data

#### In-line citation
If you have limited space (e.g. in data visualizations), you can use this abbreviated in-line citation:  
Energy Institute - Statistical Review of World Energy (2025); Population based on various sources (2024) – with major processing by Our World in Data

#### Full citation
Energy Institute - Statistical Review of World Energy (2025); Population based on various sources (2024) – with major processing by Our World in Data. “Gas consumption per capita” [dataset]. Energy Institute, “Statistical Review of World Energy”; Various sources, “Population” [original data].
Source: Energy Institute - Statistical Review of World Energy (2025), Population based on various sources (2024) – with major processing by Our World In Data

### What you should know about this data
* Excludes natural gas converted to liquid fuels but includes derivatives of coal as well as natural gas consumed in Gas-to-Liquids transformation. The difference between the world consumption figures and the world production statistics is due to variations in stocks at storage facilities and liquefaction plants, together with unavoidable disparities in the definition, measurement or conversion of gas supply and demand data.

### Sources

#### Energy Institute – Statistical Review of World Energy
Retrieved on: 2025-06-27  
Retrieved from: https://www.energyinst.org/statistical-review/  

#### Various sources – Population
Retrieved on: 2024-07-11  
Retrieved from: https://ourworldindata.org/population-sources  

#### Notes on our processing step for this indicator
Per capita figures are calculated by dividing by a population dataset that is built and maintained by Our World in Data, based on [different sources](https://ourworldindata.org/population-sources).


## Nuclear power consumption per capita – Using the substitution method
Measured in [kilowatt-hours](#dod:watt-hours) per person.
Last updated: June 27, 2025  
Next update: June 2026  
Date range: 1965–2024  
Unit: kilowatt-hours  


### How to cite this data

#### In-line citation
If you have limited space (e.g. in data visualizations), you can use this abbreviated in-line citation:  
Energy Institute - Statistical Review of World Energy (2025); Population based on various sources (2024) – with major processing by Our World in Data

#### Full citation
Energy Institute - Statistical Review of World Energy (2025); Population based on various sources (2024) – with major processing by Our World in Data. “Nuclear power consumption per capita – Using the substitution method” [dataset]. Energy Institute, “Statistical Review of World Energy”; Various sources, “Population” [original data].
Source: Energy Institute - Statistical Review of World Energy (2025), Population based on various sources (2024) – with major processing by Our World In Data

### What you should know about this data
* Primary energy is measured using the "substitution method" (also called "input-equivalent" primary energy). This method is used for non-fossil sources of electricity (namely renewables and nuclear), and measures the amount of fossil fuels that would be required by thermal power stations to generate the same amount of non-fossil electricity.
For example, if a country's nuclear power generated 100 TWh of electricity, and assuming that the efficiency of a standard thermal power plant is 38%, the input-equivalent primary energy for this country would be 100 TWh / 0.38 = 263 TWh = 0.95 EJ. This input-equivalent primary energy takes account of the inefficiencies in energy production from fossil fuels and provides a better approximation of each source's share of energy consumption. You can find more details in [the Statistical Review of World Energy's methodology document](https://www.energyinst.org/__data/assets/pdf_file/0003/1055541/Methodology.pdf).

### Sources

#### Energy Institute – Statistical Review of World Energy
Retrieved on: 2025-06-27  
Retrieved from: https://www.energyinst.org/statistical-review/  

#### Various sources – Population
Retrieved on: 2024-07-11  
Retrieved from: https://ourworldindata.org/population-sources  

#### Notes on our processing step for this indicator
Per capita figures are calculated by dividing by a population dataset that is built and maintained by Our World in Data, based on [different sources](https://ourworldindata.org/population-sources).


## Hydropower consumption per capita – Using the substitution method
Measured in [kilowatt-hours](#dod:watt-hours) per person.
Last updated: June 27, 2025  
Next update: June 2026  
Date range: 1965–2024  
Unit: kilowatt-hours  


### How to cite this data

#### In-line citation
If you have limited space (e.g. in data visualizations), you can use this abbreviated in-line citation:  
Energy Institute - Statistical Review of World Energy (2025); Population based on various sources (2024) – with major processing by Our World in Data

#### Full citation
Energy Institute - Statistical Review of World Energy (2025); Population based on various sources (2024) – with major processing by Our World in Data. “Hydropower consumption per capita – Using the substitution method” [dataset]. Energy Institute, “Statistical Review of World Energy”; Various sources, “Population” [original data].
Source: Energy Institute - Statistical Review of World Energy (2025), Population based on various sources (2024) – with major processing by Our World In Data

### What you should know about this data
* Primary energy is measured using the "substitution method" (also called "input-equivalent" primary energy). This method is used for non-fossil sources of electricity (namely renewables and nuclear), and measures the amount of fossil fuels that would be required by thermal power stations to generate the same amount of non-fossil electricity.
For example, if a country's nuclear power generated 100 TWh of electricity, and assuming that the efficiency of a standard thermal power plant is 38%, the input-equivalent primary energy for this country would be 100 TWh / 0.38 = 263 TWh = 0.95 EJ. This input-equivalent primary energy takes account of the inefficiencies in energy production from fossil fuels and provides a better approximation of each source's share of energy consumption. You can find more details in [the Statistical Review of World Energy's methodology document](https://www.energyinst.org/__data/assets/pdf_file/0003/1055541/Methodology.pdf).

### Sources

#### Energy Institute – Statistical Review of World Energy
Retrieved on: 2025-06-27  
Retrieved from: https://www.energyinst.org/statistical-review/  

#### Various sources – Population
Retrieved on: 2024-07-11  
Retrieved from: https://ourworldindata.org/population-sources  

#### Notes on our processing step for this indicator
Per capita figures are calculated by dividing by a population dataset that is built and maintained by Our World in Data, based on [different sources](https://ourworldindata.org/population-sources).


## Wind power consumption per capita – Using the substitution method
Measured in [kilowatt-hours](#dod:watt-hours) per person.
Last updated: June 27, 2025  
Next update: June 2026  
Date range: 1965–2024  
Unit: kilowatt-hours  


### How to cite this data

#### In-line citation
If you have limited space (e.g. in data visualizations), you can use this abbreviated in-line citation:  
Energy Institute - Statistical Review of World Energy (2025); Population based on various sources (2024) – with major processing by Our World in Data

#### Full citation
Energy Institute - Statistical Review of World Energy (2025); Population based on various sources (2024) – with major processing by Our World in Data. “Wind power consumption per capita – Using the substitution method” [dataset]. Energy Institute, “Statistical Review of World Energy”; Various sources, “Population” [original data].
Source: Energy Institute - Statistical Review of World Energy (2025), Population based on various sources (2024) – with major processing by Our World In Data

### What you should know about this data
* Primary energy is measured using the "substitution method" (also called "input-equivalent" primary energy). This method is used for non-fossil sources of electricity (namely renewables and nuclear), and measures the amount of fossil fuels that would be required by thermal power stations to generate the same amount of non-fossil electricity.
For example, if a country's nuclear power generated 100 TWh of electricity, and assuming that the efficiency of a standard thermal power plant is 38%, the input-equivalent primary energy for this country would be 100 TWh / 0.38 = 263 TWh = 0.95 EJ. This input-equivalent primary energy takes account of the inefficiencies in energy production from fossil fuels and provides a better approximation of each source's share of energy consumption. You can find more details in [the Statistical Review of World Energy's methodology document](https://www.energyinst.org/__data/assets/pdf_file/0003/1055541/Methodology.pdf).

### Sources

#### Energy Institute – Statistical Review of World Energy
Retrieved on: 2025-06-27  
Retrieved from: https://www.energyinst.org/statistical-review/  

#### Various sources – Population
Retrieved on: 2024-07-11  
Retrieved from: https://ourworldindata.org/population-sources  

#### Notes on our processing step for this indicator
Per capita figures are calculated by dividing by a population dataset that is built and maintained by Our World in Data, based on [different sources](https://ourworldindata.org/population-sources).


## Solar power consumption per capita – Using the substitution method
Measured in [kilowatt-hours](#dod:watt-hours) per person.
Last updated: June 27, 2025  
Next update: June 2026  
Date range: 1965–2024  
Unit: kilowatt-hours  


### How to cite this data

#### In-line citation
If you have limited space (e.g. in data visualizations), you can use this abbreviated in-line citation:  
Energy Institute - Statistical Review of World Energy (2025); Population based on various sources (2024) – with major processing by Our World in Data

#### Full citation
Energy Institute - Statistical Review of World Energy (2025); Population based on various sources (2024) – with major processing by Our World in Data. “Solar power consumption per capita – Using the substitution method” [dataset]. Energy Institute, “Statistical Review of World Energy”; Various sources, “Population” [original data].
Source: Energy Institute - Statistical Review of World Energy (2025), Population based on various sources (2024) – with major processing by Our World In Data

### What you should know about this data
* Primary energy is measured using the "substitution method" (also called "input-equivalent" primary energy). This method is used for non-fossil sources of electricity (namely renewables and nuclear), and measures the amount of fossil fuels that would be required by thermal power stations to generate the same amount of non-fossil electricity.
For example, if a country's nuclear power generated 100 TWh of electricity, and assuming that the efficiency of a standard thermal power plant is 38%, the input-equivalent primary energy for this country would be 100 TWh / 0.38 = 263 TWh = 0.95 EJ. This input-equivalent primary energy takes account of the inefficiencies in energy production from fossil fuels and provides a better approximation of each source's share of energy consumption. You can find more details in [the Statistical Review of World Energy's methodology document](https://www.energyinst.org/__data/assets/pdf_file/0003/1055541/Methodology.pdf).

### Sources

#### Energy Institute – Statistical Review of World Energy
Retrieved on: 2025-06-27  
Retrieved from: https://www.energyinst.org/statistical-review/  

#### Various sources – Population
Retrieved on: 2024-07-11  
Retrieved from: https://ourworldindata.org/population-sources  

#### Notes on our processing step for this indicator
Per capita figures are calculated by dividing by a population dataset that is built and maintained by Our World in Data, based on [different sources](https://ourworldindata.org/population-sources).


## Other renewables consumption per capita – Using the substitution method
Measured in [kilowatt-hours](#dod:watt-hours) per person.
Last updated: June 27, 2025  
Next update: June 2026  
Date range: 1965–2024  
Unit: kilowatt-hours  


### How to cite this data

#### In-line citation
If you have limited space (e.g. in data visualizations), you can use this abbreviated in-line citation:  
Energy Institute - Statistical Review of World Energy (2025); Population based on various sources (2024) – with major processing by Our World in Data

#### Full citation
Energy Institute - Statistical Review of World Energy (2025); Population based on various sources (2024) – with major processing by Our World in Data. “Other renewables consumption per capita – Using the substitution method” [dataset]. Energy Institute, “Statistical Review of World Energy”; Various sources, “Population” [original data].
Source: Energy Institute - Statistical Review of World Energy (2025), Population based on various sources (2024) – with major processing by Our World In Data

### What you should know about this data
* Primary energy is measured using the "substitution method" (also called "input-equivalent" primary energy). This method is used for non-fossil sources of electricity (namely renewables and nuclear), and measures the amount of fossil fuels that would be required by thermal power stations to generate the same amount of non-fossil electricity.
For example, if a country's nuclear power generated 100 TWh of electricity, and assuming that the efficiency of a standard thermal power plant is 38%, the input-equivalent primary energy for this country would be 100 TWh / 0.38 = 263 TWh = 0.95 EJ. This input-equivalent primary energy takes account of the inefficiencies in energy production from fossil fuels and provides a better approximation of each source's share of energy consumption. You can find more details in [the Statistical Review of World Energy's methodology document](https://www.energyinst.org/__data/assets/pdf_file/0003/1055541/Methodology.pdf).

### Sources

#### Energy Institute – Statistical Review of World Energy
Retrieved on: 2025-06-27  
Retrieved from: https://www.energyinst.org/statistical-review/  

#### Various sources – Population
Retrieved on: 2024-07-11  
Retrieved from: https://ourworldindata.org/population-sources  

#### Notes on our processing step for this indicator
Per capita figures are calculated by dividing by a population dataset that is built and maintained by Our World in Data, based on [different sources](https://ourworldindata.org/population-sources).


    