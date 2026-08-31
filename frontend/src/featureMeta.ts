/**
 * 特征元信息：把后端推送的特征名（如 mean_0_a）解析成"能看懂"的展示信息。
 *
 * emotions.csv 的特征名格式：{统计量}_{通道}_{频段}
 *   - 统计量：mean（均值）、stddev（标准差）、fft（傅里叶系数）…
 *   - 通道：0–3（Muse 4 通道头带，数据集本身只用编号命名）
 *   - 频段：a = α（8–13Hz）、b = β（13–30Hz）
 *
 * 频段范围与"α=放松 / β=专注"属于通用 EEG 科普知识（并非本数据集标注的数值）。
 * 所有数值标注一律来自真实数据，科普文字一律明确标注"（科普）"。
 */

/** 特征解析结果 */
export interface FeatureMeta {
  channel: number;      // 通道编号 0..3
  band: 'α' | 'β';      // 频段
  color: string;        // 线色（α 统一蓝色系、β 统一橙色系）
  label: string;        // "通道0·α"
  stat: string;         // 统计量名，如 mean
  meaning: string;      // 一句话含义（含科普标注）
}

/** α 频段：4 个通道共用蓝色系（由深到浅） */
const ALPHA_COLORS = ['#1677FF', '#4096FF', '#69B1FF', '#91CAFF'];
/** β 频段：4 个通道共用橙色系（由深到浅） */
const BETA_COLORS = ['#FA8C16', '#FFA940', '#FFC069', '#FFD666'];

/** 频段科普文案 */
const BAND_MEANING: Record<'a' | 'b', string> = {
  a: 'α 频段（8–13Hz）：通常与放松、平静、闭眼休息相关（科普）',
  b: 'β 频段（13–30Hz）：通常与专注、思考、警觉相关（科普）',
};

const NAME_RE = /^([a-z0-9]+)_(\d)_([ab])$/i;

/** 解析特征名；非 {统计量}_{通道}_{频段} 格式返回 null */
export function featureMeta(name: string): FeatureMeta | null {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  const stat = m[1].toLowerCase();
  const channel = Number(m[2]);
  const bandKey = (m[3].toLowerCase() === 'a' ? 'a' : 'b') as 'a' | 'b';
  const isAlpha = bandKey === 'a';
  const band = isAlpha ? 'α' : 'β';
  const color = isAlpha ? ALPHA_COLORS[channel % ALPHA_COLORS.length] : BETA_COLORS[channel % BETA_COLORS.length];
  return {
    channel,
    band,
    color,
    label: `通道${channel}·${band}`,
    stat,
    meaning: `通道${channel} 的${band}频段活动均值：${BAND_MEANING[bandKey]}；值越大 → 该通道${band}频段活动越强。`,
  };
}

/** 归一化前对每个特征计算的"窗口统计"，供强度指示 / 特征观察使用 */
export interface WindowStats {
  latest: number;      // 最新值
  mean: number;        // 窗口均值
  ratio: number;       // latest / mean（mean 为 0 时取 1）
  strong: boolean;     // 是否明显偏强（latest > mean）
}

/** 由一段窗口数值计算最新值相对窗口均值的强弱（真实数据，不做假设） */
export function windowStats(values: number[]): WindowStats | null {
  if (values.length === 0) return null;
  const latest = values[values.length - 1];
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const ratio = mean === 0 ? 1 : latest / mean;
  return { latest, mean, ratio, strong: latest > mean };
}
