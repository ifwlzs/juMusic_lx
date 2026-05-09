import P01HeroCoverPage from '@/pages/P01HeroCoverPage.vue'
import P02OverviewStatsPage from '@/pages/P02OverviewStatsPage.vue'
import P03BreadthStatsPage from '@/pages/P03BreadthStatsPage.vue'
import P04ForeignLanguagePage from '@/pages/P04ForeignLanguagePage.vue'
import P05ExplorationContrastPage from '@/pages/P05ExplorationContrastPage.vue'
import P06KeywordPosterPage from '@/pages/P06KeywordPosterPage.vue'
import P07StoryPlaceholderPage from '@/pages/P07StoryPlaceholderPage.vue'
import P08GenreRankingPage from '@/pages/P08GenreRankingPage.vue'
import P09GenreTimelinePage from '@/pages/P09GenreTimelinePage.vue'
import P10GenreScorePage from '@/pages/P10GenreScorePage.vue'
import P11CoverColorPage from '@/pages/P11CoverColorPage.vue'
import P12SeasonFavoritePage from '@/pages/P12SeasonFavoritePage.vue'
import P16ArtistHeroPage from '@/pages/P16ArtistHeroPage.vue'
import P17WeekRhythmPage from '@/pages/P17WeekRhythmPage.vue'
import P18CalendarHeatmapPage from '@/pages/P18CalendarHeatmapPage.vue'
import P19TimePreferencePage from '@/pages/P19TimePreferencePage.vue'
import P20LateNightHeroPage from '@/pages/P20LateNightHeroPage.vue'
import P21TimelineNightPage from '@/pages/P21TimelineNightPage.vue'
import P23AlbumHeroPage from '@/pages/P23AlbumHeroPage.vue'
import P24AlbumRankingPage from '@/pages/P24AlbumRankingPage.vue'
import P25SongHeroPage from '@/pages/P25SongHeroPage.vue'
import P31LibraryCoveragePage from '@/pages/P31LibraryCoveragePage.vue'
import L01LibraryOverviewPage from '@/pages/L01LibraryOverviewPage.vue'
import L02LibraryGrowthPage from '@/pages/L02LibraryGrowthPage.vue'
import L03LibraryStructurePage from '@/pages/L03LibraryStructurePage.vue'
import L04LibraryArtistRankingPage from '@/pages/L04LibraryArtistRankingPage.vue'
import L04NewArtistRankingPage from '@/pages/L04NewArtistRankingPage.vue'
import P32YearSummaryPage from '@/pages/P32YearSummaryPage.vue'
import ExportPdfPage from '@/pages/ExportPdfPage.vue'
import UnknownReportPage from '@/pages/UnknownReportPage.vue'

// 页面注册表：先按试点页映射组件，后续其余页面补进来时只需扩展这里。
const PAGE_COMPONENT_MAP = {
  'P01': P01HeroCoverPage,
  'P02': P02OverviewStatsPage,
  'P03': P03BreadthStatsPage,
  'P04': P04ForeignLanguagePage,
  'P05': P05ExplorationContrastPage,
  'P06': P06KeywordPosterPage,
  'P07': P07StoryPlaceholderPage,
  'P08': P08GenreRankingPage,
  'P09': P09GenreTimelinePage,
  'P10': P10GenreScorePage,
  'P11': P11CoverColorPage,
  'P12': P12SeasonFavoritePage,
  'P13': P12SeasonFavoritePage,
  'P14': P12SeasonFavoritePage,
  'P15': P12SeasonFavoritePage,
  'P16': P16ArtistHeroPage,
  'P17': P17WeekRhythmPage,
  'P18': P18CalendarHeatmapPage,
  'P19': P19TimePreferencePage,
  'P20': P20LateNightHeroPage,
  'P21': P21TimelineNightPage,
  'P23': P23AlbumHeroPage,
  'P24': P24AlbumRankingPage,
  'P25': P25SongHeroPage,
  'P31': P31LibraryCoveragePage,
  'L01': L01LibraryOverviewPage,
  'L02': L02LibraryGrowthPage,
  'L03': L03LibraryStructurePage,
  // L04 拆成两个终态页面，分别承接曲库榜与年度新增榜。
  'L04A': L04LibraryArtistRankingPage,
  'L04B': L04NewArtistRankingPage,
  'P32': P32YearSummaryPage,
  'SYS_EXPORT': ExportPdfPage,
}

export function resolvePageComponent(pageId) {
  // 未注册页号显式落到占位组件，避免 contract 与注册表不同步时被静默伪装成首页。
  return PAGE_COMPONENT_MAP[pageId] || UnknownReportPage
}
