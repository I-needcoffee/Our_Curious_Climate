import type { ChartType } from '../App';
import type { TutorialLiveSnapshot } from '../context/TutorialLiveContext';
import { EPW_COLUMNS } from './epwParser';

export const TUTORIAL_LEGEND_DOM_ID = 'dashboard-card-legend' as const;

export type TutorialAggregation = 'hour' | 'day' | 'week' | 'month';
export type TutorialUtciMode = 'categories' | 'comfortTime' | 'gradient';

export interface TutorialGuideInput {
  chartType: Exclude<ChartType, 'empty'>;
  slotVariableId?: string;
  slotVariableName?: string;
  live: {
    aggregation?: TutorialAggregation;
    colorVarId?: string;
    colorVarName?: string;
    utciColorMode?: TutorialUtciMode;
    includeSun?: boolean;
    includeWind?: boolean;
    optimizeMode?: boolean;
    utciGroundLabel?: string | null;
    windRoseBins?: number;
    radiusVarId?: string;
    radiusVarName?: string;
  };
}

/** Side-panel copy focused on what the chart shows (not toolbar chrome). */
export interface TutorialGuideCopy {
  chartTitle: string;
  overviewBody: string;
  readingTitle: string;
  readingBody: string;
}

const COLUMN_BY_ID = Object.fromEntries(EPW_COLUMNS.map(c => [c.id, c])) as Record<
  string,
  (typeof EPW_COLUMNS)[number]
>;

function aggregationPlain(a?: TutorialAggregation): string {
  switch (a) {
    case 'hour':
      return 'hour-by-hour';
    case 'day':
      return 'day-by-day';
    case 'week':
      return 'week-by-week';
    case 'month':
      return 'month-by-month';
    default:
      return 'month-by-month';
  }
}

function aggregationExplain(a?: TutorialAggregation): string {
  switch (a) {
    case 'hour':
      return 'Each narrow column is one hour of the year in order—fine detail, but busy.';
    case 'day':
      return 'Each column is one calendar day, with values rolled up for that day.';
    case 'week':
      return 'Each column is one week of the year, rolled up for that week.';
    case 'month':
      return 'Each column is one calendar month, rolled up for that month.';
    default:
      return 'You can switch the time step on the card to change how columns group.';
  }
}

function plainColorSentence(id: string, displayName: string): string {
  const c = COLUMN_BY_ID[id];
  const name = displayName || c?.name || 'this measurement';
  switch (id) {
    case 'dryBulbTemperature':
      return `${name} is the air temperature in the shade—often the first number people check for comfort and heating or cooling loads.`;
    case 'dewPointTemperature':
      return `${name} tracks moisture in the air; when it sits close to the air temperature, it feels humid.`;
    case 'relativeHumidity':
      return `${name} is how full the air is of moisture, as a percent; it pairs with temperature to describe “muggy” days.`;
    case 'globalHorizontalRadiation':
    case 'directNormalRadiation':
    case 'diffuseHorizontalRadiation':
      return `${name} is about incoming sunshine on surfaces (here in watt-hours per square meter per timestep).`;
    case 'windSpeed':
      return `${name} is how fast the air is moving at the station; breezes cool people and buildings faster.`;
    case 'windDirection':
      return `${name} is the compass direction the wind blows from (0° is north, moving clockwise).`;
    case 'atmosphericPressure':
      return `${name} is the weight of the air at the site; big swings often line up with changing weather.`;
    case 'precipitableWater':
    case 'liquidPrecipitationDepth':
    case 'liquidPrecipitationQuantity':
      return `${name} summarizes moisture or rain in the file.`;
    default:
      return `${name} is one of the columns stored in this weather file; higher numbers mean “more” of that quantity for that timestep.`;
  }
}

function explorerCopy(input: TutorialGuideInput): TutorialGuideCopy {
  const agg = input.live.aggregation;
  const aggWords = aggregationPlain(agg);
  const rowVarId = input.slotVariableId || input.live.colorVarId || 'dryBulbTemperature';
  const rowName = input.slotVariableName || COLUMN_BY_ID[rowVarId]?.name || input.live.colorVarName || 'Primary measurement';
  const colorId = input.live.colorVarId || rowVarId;
  const colorName = input.live.colorVarName || COLUMN_BY_ID[colorId]?.name || 'Color measurement';

  return {
    chartTitle: 'Data explorer heatmap',
    overviewBody: `This view stacks the whole year into a grid: hours run top to bottom, and time moves left to right in ${aggWords} steps. Bar height follows ${rowName}. Color follows ${colorName}. ${aggregationExplain(agg)}`,
    readingTitle: 'How to read it',
    readingBody: `${plainColorSentence(colorId, colorName)} If you narrow months or hours in Settings, both the bars and colors reflect only that slice of the year.`,
  };
}

function windExplorerCopy(input: TutorialGuideInput): TutorialGuideCopy {
  const agg = input.live.aggregation;
  const aggWords = aggregationPlain(agg);
  const colorId = input.live.colorVarId || 'windSpeed';
  const colorName = input.live.colorVarName || COLUMN_BY_ID[colorId]?.name || 'Overlay measurement';

  return {
    chartTitle: 'Wind explorer',
    overviewBody: `Each arrow shows where the wind came from (direction) and how strong it was (length), grouped ${aggWords}. Color adds ${colorName} so you can see, for example, whether warm or cold air lined up with certain breezes. ${aggregationExplain(agg)}`,
    readingTitle: 'How to read it',
    readingBody:
      'Longer arrows mean stronger winds for that bucket of time. Dense “fans” of arrows point to the directions you feel most often; short arrows mean calmer spells.',
  };
}

function windRoseCopy(input: TutorialGuideInput): TutorialGuideCopy {
  const bins = input.live.windRoseBins ?? 16;
  const colorId = input.live.colorVarId || 'windSpeed';
  const colorName = input.live.colorVarName || COLUMN_BY_ID[colorId]?.name || 'Overlay measurement';

  return {
    chartTitle: 'Wind rose',
    overviewBody: `Picture a compass on the ground. Each wedge is a wind direction; the farther a wedge reaches from the center, the more often wind came from that direction. Wedges are split into ${bins} direction bins, and color shows ${colorName} for that direction and speed slice.`,
    readingTitle: 'How to read it',
    readingBody:
      'The longest spoke is your prevailing wind direction. A tight rose means winds usually arrive from similar directions; a wide rose means the site sees winds swinging around the compass.',
  };
}

function sunpathCopy(input: TutorialGuideInput): TutorialGuideCopy {
  const agg = input.live.aggregation;
  const aggWords = aggregationPlain(agg);
  const colorId = input.live.colorVarId || 'dryBulbTemperature';
  const radiusId = input.live.radiusVarId || 'globalHorizontalRadiation';
  const colorName = input.live.colorVarName || COLUMN_BY_ID[colorId]?.name || 'your color measurement';
  const radiusName = input.live.radiusVarName || COLUMN_BY_ID[radiusId]?.name || 'your radius measurement';

  return {
    chartTitle: 'Sun path diagram',
    overviewBody: `This is a year-round “sky clock”: the ring is the horizon, and the sun’s path climbs higher in summer and dips lower in winter. Each dot is a moment when the sun is above the horizon, grouped ${aggWords}. Color follows ${colorName}. How far the dot sits from the middle (its radius on the chart) follows ${radiusName}—that distance is scaled for readability, not a map distance on the ground.`,
    readingTitle: 'How to read it',
    readingBody:
      'Look for dense bands of dots where you get steady daylight, and sparse areas where the sun barely visits. That helps compare seasons at a glance without reading every number.',
  };
}

function utciCopy(input: TutorialGuideInput): TutorialGuideCopy {
  const mode = input.live.utciColorMode ?? 'comfortTime';
  const agg = input.live.aggregation;
  const aggWords = aggregationPlain(agg);
  const optimize = input.live.optimizeMode === true;
  const sun = input.live.includeSun !== false;
  const wind = input.live.includeWind !== false;

  const modeIntro =
    mode === 'categories'
      ? 'Colors follow comfort stress bands from very cold stress through neutral to very hot stress.'
      : mode === 'comfortTime'
        ? 'Each cell shows what share of timesteps felt physiologically comfortable for that bucket of time.'
        : 'Each cell shows the modeled comfort temperature itself on a color ramp you can change in Settings.';

  const groundNote =
    input.live.utciGroundLabel
      ? ` Ground is ${input.live.utciGroundLabel}.`
      : '';
  const exposureIntro = optimize
    ? 'Optimize mode picks the most comfortable of the four sun/wind exposures every hour. Stay on Comfort for the usual gradient, or switch to Exposure to map which condition wins.'
    : `Solar is ${sun ? 'on' : 'off'} and wind is ${wind ? 'on' : 'off'} in the model (sun/wind badges or the comfort table).`;

  return {
    chartTitle: 'Outdoor comfort (UTCI)',
    overviewBody: `UTCI blends air temperature, humidity, wind, and shortwave sun into one outdoor comfort reading. ${exposureIntro}${groundNote} ${modeIntro} Columns move ${aggWords}. ${aggregationExplain(agg)}`,
    readingTitle: 'How to read it',
    readingBody: optimize
      ? 'Comfort view keeps the familiar green comfort-time (or category/temperature) fills under the best hourly exposure. Exposure view draws icons for what to leave exposed — sun (moon at night) and/or wind, or a house when fully sheltered.'
      : 'Scan for seasons that look comfortable versus stressful. Switching modes swaps between stress categories, time spent comfortable, or raw comfort temperature. Turn on Optimize to let each hour choose its best exposure.',
  };
}

function naturalVentilationCopy(input: TutorialGuideInput): TutorialGuideCopy {
  const agg = input.live.aggregation;
  const aggWords = aggregationPlain(agg);

  return {
    chartTitle: 'Natural ventilation',
    overviewBody: `This view screens outdoor hours when operable windows or natural ventilation may be viable, using dry-bulb temperature and relative humidity limits you can adjust in Settings. Blue intensity shows the share of suitable hours in each time bucket. Columns move ${aggWords}. ${aggregationExplain(agg)}`,
    readingTitle: 'How to read it',
    readingBody:
      'Look for seasons and times of day with strong blue bands—those are when outdoor air likely meets your criteria. Quick numbers compare common, conservative, and cooling presets, plus a breakdown of whether temperature or humidity is the limiting factor.',
  };
}

export function getTutorialLegendHoverDef(
  chartType: ChartType,
  live: TutorialLiveSnapshot
): { id: typeof TUTORIAL_LEGEND_DOM_ID; title: string; body: string } | null {
  if (chartType === 'empty') return null;

  const title = 'Legend';

  switch (chartType) {
    case 'explorer': {
      const colorId = live.colorVarId || 'dryBulbTemperature';
      const colorName = live.colorVarName || COLUMN_BY_ID[colorId]?.name || 'Color variable';
      return {
        id: TUTORIAL_LEGEND_DOM_ID,
        title,
        body: `The pill shows ${colorName} with the active color palette. Tick labels span min → max across your filtered months and hours.`,
      };
    }
    case 'wind': {
      const colorId = live.colorVarId || 'windSpeed';
      const colorName = live.colorVarName || COLUMN_BY_ID[colorId]?.name || 'Color variable';
      return {
        id: TUTORIAL_LEGEND_DOM_ID,
        title,
        body: `Colors map ${colorName} across the filtered period using the selected palette.`,
      };
    }
    case 'windrose': {
      const colorId = live.colorVarId || 'windSpeed';
      const colorName = live.colorVarName || COLUMN_BY_ID[colorId]?.name || 'Color variable';
      return {
        id: TUTORIAL_LEGEND_DOM_ID,
        title,
        body: `The gradient encodes ${colorName} from low (left) to high (right) for the filtered period.`,
      };
    }
    case 'sunpath': {
      const colorId = live.colorVarId;
      const colorName =
        live.colorVarName || (colorId ? COLUMN_BY_ID[colorId]?.name : undefined) || 'Selected variable';
      return {
        id: TUTORIAL_LEGEND_DOM_ID,
        title,
        body: `Shows the color scale for ${colorName} with the active palette.`,
      };
    }
    case 'utci': {
      const mode = live.utciColorMode ?? 'comfortTime';
      const body =
        mode === 'categories'
          ? 'The strip lists UTCI stress categories from colder stress on the left to hotter stress on the right. “No thermal stress” marks the comfort band.'
          : mode === 'comfortTime'
            ? 'The strip reflects time-in-comfort encoding for each column (change mode in Settings).'
            : 'The strip shows numeric UTCI with your palette from low (left) to high (right).';
      return { id: TUTORIAL_LEGEND_DOM_ID, title, body };
    }
    default:
      return {
        id: TUTORIAL_LEGEND_DOM_ID,
        title,
        body: 'This strip maps values to colors for the active chart.',
      };
  }
}

export function getTutorialGuideCopy(input: TutorialGuideInput): TutorialGuideCopy {
  switch (input.chartType) {
    case 'explorer':
      return explorerCopy(input);
    case 'wind':
      return windExplorerCopy(input);
    case 'windrose':
      return windRoseCopy(input);
    case 'sunpath':
      return sunpathCopy(input);
    case 'utci':
      return utciCopy(input);
    case 'naturalVentilation':
      return naturalVentilationCopy(input);
    default:
      return {
        chartTitle: 'Chart',
        overviewBody: 'Pick a chart type to see what this workspace can show.',
        readingTitle: 'Next step',
        readingBody: 'Choose a chart from the empty slot to load a guided explanation and quick numbers.',
      };
  }
}
