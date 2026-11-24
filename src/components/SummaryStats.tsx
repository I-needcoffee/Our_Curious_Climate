import { useState } from 'react';
import { EPWDataRow, EPWVariable } from '../lib/epwParser';
import type { GlobalFilterState } from '../lib/globalFilter';
import { rowPassesGlobalFilters } from '../lib/globalFilter';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { UnitSystem } from '../App';
import { epwEquivalentHourKey, indexEpwByEquivalentHour, isFiniteNumber } from '../lib/epwClockMatch';
import { computeUtciForEpwRow } from '../lib/utciModel';
import { UNIT_C, UNIT_F } from '../lib/unitConversion';

interface SummaryStatsProps {
  data: EPWDataRow[];
  compareData?: EPWDataRow[];
  showDifference?: boolean;
  variables: EPWVariable[];
  filter: GlobalFilterState;
  unitSystem: UnitSystem;
  theme: 'light' | 'dark';
}

export function SummaryStats({ data, compareData, showDifference, variables, filter, unitSystem, theme }: SummaryStatsProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  // Filter data based on the global filter
  const filteredData = data.filter(d => rowPassesGlobalFilters(d, filter));

  if (filteredData.length === 0) {
    return null;
  }

  // Calculate averages and totals
  const tempVar = variables.find(v => v.id === 'dryBulbTemperature');
  const rhVar = variables.find(v => v.id === 'relativeHumidity');
  const windVar = variables.find(v => v.id === 'windSpeed');
  const rainVar = variables.find(v => v.id === 'liquidPrecipitationDepth');

  let avgTemp = 0;
  let tempCount = 0;
  let avgRh = 0;
  let rhCount = 0;
  let avgWind = 0;
  let windCount = 0;
  let totalRain = 0;
  let avgUtci = 0;
  let utciCount = 0;
  let comfortHours = 0;

  const compareByHour = showDifference && compareData ? indexEpwByEquivalentHour(compareData) : null;

  filteredData.forEach(d => {
    const compareRow = compareByHour?.get(epwEquivalentHourKey(d));
    
    const getVal = (v: EPWVariable | undefined) => {
      if (!v) return null;
      const primaryVal = d[v.id] as number;
      if (!isFiniteNumber(primaryVal)) return null;
      if (showDifference && compareData) {
        const compareVal = compareRow?.[v.id] as number;
        if (!isFiniteNumber(compareVal)) return null;
        return compareVal - primaryVal;
      }
      return primaryVal;
    };

    const add = (bucket: 'temp' | 'rh' | 'wind' | 'rain', value: number | null) => {
      if (value == null) return;
      if (bucket === 'temp') { avgTemp += value; tempCount++; }
      if (bucket === 'rh') { avgRh += value; rhCount++; }
      if (bucket === 'wind') { avgWind += value; windCount++; }
      if (bucket === 'rain') totalRain += value;
    };
    add('temp', getVal(tempVar));
    add('rh', getVal(rhVar));
    add('wind', getVal(windVar));
    add('rain', getVal(rainVar));
    
    const primaryUtci = computeUtciForEpwRow(d)?.utci;
    const compareUtci = compareRow ? computeUtciForEpwRow(compareRow)?.utci : undefined;
    if (showDifference && compareData) {
      if (primaryUtci != null && compareUtci != null) {
        avgUtci += compareUtci - primaryUtci;
        utciCount++;
      }
    } else if (primaryUtci != null) {
      avgUtci += primaryUtci;
      utciCount++;
      if (primaryUtci >= 9 && primaryUtci <= 26) comfortHours++;
    }
  });

  const count = filteredData.length;
  if (tempCount > 0) avgTemp /= tempCount;
  if (rhCount > 0) avgRh /= rhCount;
  if (windCount > 0) avgWind /= windCount;
  if (utciCount > 0) avgUtci /= utciCount;

  // Convert units if imperial
  if (unitSystem === 'imperial') {
    if (showDifference) {
      avgTemp = avgTemp * 9/5; // Difference in C to difference in F is just * 1.8
      avgUtci = avgUtci * 9/5;
    } else {
      avgTemp = avgTemp * 9/5 + 32;
      avgUtci = avgUtci * 9/5 + 32;
    }
    avgWind = avgWind * 2.23694; // m/s to mph
    totalRain = totalRain / 25.4; // mm to inches
  }

  // Calculate comfort percentage (UTCI between 9 and 26)
  const comfortPercent = utciCount > 0 ? (comfortHours / utciCount) * 100 : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <div className={`p-4 rounded-xl shadow-hard-md border ${theme === 'dark' ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-100'}`}>
        <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>{showDifference ? 'Δ Avg Temp' : 'Avg Temp'}</div>
        <div className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{avgTemp > 0 && showDifference ? '+' : ''}{avgTemp.toFixed(1)}{unitSystem === 'imperial' ? UNIT_F : UNIT_C}</div>
      </div>
      
      <div className={`p-4 rounded-xl shadow-hard-md border ${theme === 'dark' ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-100'}`}>
        <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>{showDifference ? 'Δ Avg Humidity' : 'Avg Humidity'}</div>
        <div className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{avgRh > 0 && showDifference ? '+' : ''}{avgRh.toFixed(0)}%</div>
      </div>

      <div className={`p-4 rounded-xl shadow-hard-md border ${theme === 'dark' ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-100'}`}>
        <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>{showDifference ? 'Δ Avg Wind' : 'Avg Wind'}</div>
        <div className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{avgWind > 0 && showDifference ? '+' : ''}{avgWind.toFixed(1)} {unitSystem === 'imperial' ? 'mph' : 'm/s'}</div>
      </div>

      <div className={`p-4 rounded-xl shadow-hard-md border ${theme === 'dark' ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-100'}`}>
        <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>{showDifference ? 'Δ Total Rain' : 'Total Rainfall'}</div>
        <div className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{totalRain > 0 && showDifference ? '+' : ''}{totalRain.toFixed(unitSystem === 'imperial' ? 2 : 0)} {unitSystem === 'imperial' ? 'in' : 'mm'}</div>
      </div>

      {utciCount > 0 && (
        <>
          <div className={`p-4 rounded-xl shadow-hard-md border ${theme === 'dark' ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-100'}`}>
            <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>{showDifference ? 'Δ Avg UTCI' : 'Avg UTCI'}</div>
            <div className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{avgUtci > 0 && showDifference ? '+' : ''}{avgUtci.toFixed(1)}{unitSystem === 'imperial' ? UNIT_F : UNIT_C}</div>
          </div>
          {!showDifference && (
            <div className={`p-4 rounded-xl shadow-hard-md border ${theme === 'dark' ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-100'}`}>
              <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Comfort Time</div>
              <div className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{comfortPercent.toFixed(1)}%</div>
            </div>
          )}
        </>
      )}

      <div className={`p-4 rounded-xl shadow-hard-md border ${theme === 'dark' ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-100'}`}>
        <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Selected Hours</div>
        <div className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{count}</div>
      </div>
    </div>
  );
}
