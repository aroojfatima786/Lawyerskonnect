import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Link, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import {
  FiSearch,
  FiFilter,
  FiMapPin,
  FiX,
  FiCheckCircle,
  FiCalendar,
  FiVideo,
  FiShield,
  FiChevronDown,
} from 'react-icons/fi';
import { lawyerApi } from '../../services/api';
import { Navbar, Footer } from '../../components/layouts';
import { Button, Select, Card, Rating, Avatar, Badge } from '../../components/ui';
import { useAuth, useRole } from '../../context/AuthContext';
import { FindLawyersAiGuidanceCta } from '../../components/public/FindLawyersAiGuidanceCta';

export default function SearchLawyers() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [lawyers, setLawyers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  /** Mobile filter drawer */
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  /** Desktop / tablet expanded advanced filters */
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });

  const isInDashboard = location.pathname === '/client/find-lawyer';

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [city, setCity] = useState(searchParams.get('city') || '');
  const [practiceArea, setPracticeArea] = useState(searchParams.get('practiceArea') || '');
  const [minRating, setMinRating] = useState(searchParams.get('minRating') || '');
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') || 'rating');
  const [latitude, setLatitude] = useState(searchParams.get('latitude') || '');
  const [longitude, setLongitude] = useState(searchParams.get('longitude') || '');
  const [radius, setRadius] = useState(searchParams.get('radius') || '10');
  const [locationError, setLocationError] = useState('');
  const [minExperience, setMinExperience] = useState(searchParams.get('minExperience') || '');
  const [maxExperience, setMaxExperience] = useState(searchParams.get('maxExperience') || '');
  const [minFee, setMinFee] = useState(searchParams.get('minFee') || '');
  const [maxFee, setMaxFee] = useState(searchParams.get('maxFee') || '');

  useEffect(() => {
    loadFilters();
  }, []);

  useEffect(() => {
    loadLawyers();
  }, [searchParams]);

  useEffect(() => {
    setSearch(searchParams.get('search') || '');
    setCity(searchParams.get('city') || '');
    setPracticeArea(searchParams.get('practiceArea') || '');
    setMinRating(searchParams.get('minRating') || '');
    setSortBy(searchParams.get('sortBy') || 'rating');
    setLatitude(searchParams.get('latitude') || '');
    setLongitude(searchParams.get('longitude') || '');
    setRadius(searchParams.get('radius') || '10');
    setMinExperience(searchParams.get('minExperience') || '');
    setMaxExperience(searchParams.get('maxExperience') || '');
    setMinFee(searchParams.get('minFee') || '');
    setMaxFee(searchParams.get('maxFee') || '');
  }, [searchParams]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    const g = (k: string) => searchParams.get(k);
    if (g('search')) n++;
    if (g('city')) n++;
    if (g('practiceArea')) n++;
    if (g('minRating')) n++;
    if (g('minExperience') || g('maxExperience')) n++;
    if (g('minFee') || g('maxFee')) n++;
    if (g('latitude') && g('longitude')) n++;
    if (g('sortBy') && g('sortBy') !== 'rating') n++;
    if (g('radius') && g('radius') !== '10' && g('latitude') && g('longitude')) n++;
    return n;
  }, [searchParams]);

  const filterChips = useMemo(() => {
    const list: { id: string; label: string }[] = [];
    const g = (k: string) => searchParams.get(k);
    if (g('search')) list.push({ id: 'search', label: `Issue: ${g('search')}` });
    if (g('practiceArea')) list.push({ id: 'practiceArea', label: `Practice: ${g('practiceArea')}` });
    if (g('city')) list.push({ id: 'city', label: `City: ${g('city')}` });
    if (g('minRating')) list.push({ id: 'minRating', label: `Rating: ${g('minRating')}+ stars` });
    const minE = g('minExperience');
    const maxE = g('maxExperience');
    if (minE && maxE) list.push({ id: 'experienceRange', label: `Experience: ${minE}–${maxE} yrs` });
    else if (minE) list.push({ id: 'minExperience', label: `Experience ≥ ${minE} yrs` });
    else if (maxE) list.push({ id: 'maxExperience', label: `Experience ≤ ${maxE} yrs` });
    const minF = g('minFee');
    const maxF = g('maxFee');
    if (minF && maxF) {
      list.push({
        id: 'feeRange',
        label: `Fee: ${Number(minF).toLocaleString()}–${Number(maxF).toLocaleString()} PKR`,
      });
    } else if (minF) {
      list.push({ id: 'minFee', label: `Fee ≥ ${Number(minF).toLocaleString()} PKR` });
    } else if (maxF) {
      list.push({ id: 'maxFee', label: `Fee ≤ ${Number(maxF).toLocaleString()} PKR` });
    }
    if (g('latitude') && g('longitude')) {
      list.push({ id: 'nearby', label: `Nearby: ${g('radius') || '10'} km` });
    }
    const sb = g('sortBy');
    if (sb && sb !== 'rating') {
      const labels: Record<string, string> = {
        reviews: 'Most reviews',
        experience: 'Most experience',
        fee: 'Lowest fee',
        distance: 'Closest first',
      };
      list.push({ id: 'sortBy', label: `Sort: ${labels[sb] || sb}` });
    }
    return list;
  }, [searchParams]);

  const categorySelectOptions = useMemo(
    () => [{ value: '', label: 'All practice areas' }, ...categories.map((c: any) => ({ value: c.name, label: c.name }))],
    [categories],
  );
  const citySelectOptions = useMemo(
    () => [{ value: '', label: 'All cities' }, ...cities.map((c) => ({ value: c, label: c }))],
    [cities],
  );

  const loadFilters = async () => {
    try {
      const [categoriesRes, citiesRes] = await Promise.all([lawyerApi.getCategories(), lawyerApi.getCities()]);
      setCategories((categoriesRes as any).data || []);
      setCities((citiesRes as any).data || []);
    } catch {
      /* keep empty lists */
    }
  };

  const loadLawyers = async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number | boolean | undefined> = {
        page: Number(searchParams.get('page')) || 1,
        limit: 12,
        sortBy: searchParams.get('sortBy') || 'rating',
        sortOrder: 'desc',
      };

      const g = (k: string) => searchParams.get(k);
      if (g('search')) params.search = g('search')!;
      if (g('city')) params.city = g('city')!;
      if (g('practiceArea')) params.practiceArea = g('practiceArea')!;
      if (g('minRating')) params.minRating = Number(g('minRating'));
      if (g('latitude')) params.latitude = Number(g('latitude'));
      if (g('longitude')) params.longitude = Number(g('longitude'));
      if (g('radius')) params.radius = Number(g('radius'));
      if (g('minExperience')) params.minExperience = Number(g('minExperience'));
      if (g('maxExperience')) params.maxExperience = Number(g('maxExperience'));
      if (g('minFee')) params.minFee = Number(g('minFee'));
      if (g('maxFee')) params.maxFee = Number(g('maxFee'));

      const response: any = await lawyerApi.search(params);
      const rawList = response.data || [];
      const verifiedOnly = rawList.filter(
        (l: any) => (l?.lawyerProfile?.verificationStatus || '').toLowerCase() === 'verified',
      );
      setLawyers(verifiedOnly);
      setPagination(response.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch {
      setLawyers([]);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (city) params.set('city', city);
    if (practiceArea) params.set('practiceArea', practiceArea);
    if (minRating) params.set('minRating', minRating);
    if (sortBy) params.set('sortBy', sortBy);
    if (latitude && longitude) {
      params.set('latitude', latitude);
      params.set('longitude', longitude);
    }
    if (radius) params.set('radius', radius);
    if (minExperience) params.set('minExperience', minExperience);
    if (maxExperience) params.set('maxExperience', maxExperience);
    if (minFee) params.set('minFee', minFee);
    if (maxFee) params.set('maxFee', maxFee);
    params.set('page', '1');
    setSearchParams(params);
    setFilterDrawerOpen(false);
  };

  const clearFilters = () => {
    setSearch('');
    setCity('');
    setPracticeArea('');
    setMinRating('');
    setSortBy('rating');
    setLatitude('');
    setLongitude('');
    setRadius('10');
    setLocationError('');
    setMinExperience('');
    setMaxExperience('');
    setMinFee('');
    setMaxFee('');
    setSearchParams({});
  };

  const removeChip = (id: string) => {
    const p = new URLSearchParams(searchParams);
    switch (id) {
      case 'search':
        p.delete('search');
        break;
      case 'city':
        p.delete('city');
        break;
      case 'practiceArea':
        p.delete('practiceArea');
        break;
      case 'minRating':
        p.delete('minRating');
        break;
      case 'minExperience':
        p.delete('minExperience');
        break;
      case 'maxExperience':
        p.delete('maxExperience');
        break;
      case 'minFee':
        p.delete('minFee');
        break;
      case 'maxFee':
        p.delete('maxFee');
        break;
      case 'feeRange':
        p.delete('minFee');
        p.delete('maxFee');
        break;
      case 'experienceRange':
        p.delete('minExperience');
        p.delete('maxExperience');
        break;
      case 'sortBy':
        p.delete('sortBy');
        break;
      case 'nearby':
        p.delete('latitude');
        p.delete('longitude');
        p.delete('radius');
        break;
      default:
        break;
    }
    p.set('page', '1');
    setSearchParams(p);
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toString();
        const lng = position.coords.longitude.toString();
        setLatitude(lat);
        setLongitude(lng);
        setLocationError('');

        const params = new URLSearchParams(searchParams);
        params.set('latitude', lat);
        params.set('longitude', lng);
        if (!params.get('radius')) params.set('radius', radius || '10');
        params.set('page', '1');
        setSearchParams(params);
      },
      (error) => {
        setLocationError(error.message || 'Unable to access your location.');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 10000,
      },
    );
  };

  const hasActiveFilters =
    search ||
    city ||
    practiceArea ||
    minRating ||
    minExperience ||
    maxExperience ||
    minFee ||
    maxFee ||
    (latitude && longitude);

  const selectTall = 'min-h-[42px] w-full border-slate-200/90 bg-white py-2 text-sm';

  const fl = (t: string) => <span className="mb-1 block text-xs font-medium text-lk-muted">{t}</span>;

  const advancedGridClass = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4';

  const primaryFiltersFieldsJsx = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="min-w-0">
        {fl('Practice area')}
        <Select
          value={practiceArea}
          onChange={(e) => setPracticeArea(e.target.value)}
          className={selectTall}
          options={categorySelectOptions}
        />
      </div>
      <div className="min-w-0">
        {fl('City')}
        <Select value={city} onChange={(e) => setCity(e.target.value)} className={selectTall} options={citySelectOptions} />
      </div>
      <div className="min-w-0">
        {fl('Minimum rating')}
        <Select
          value={minRating}
          onChange={(e) => setMinRating(e.target.value)}
          className={selectTall}
          options={[
            { value: '', label: 'Any rating' },
            { value: '4', label: '4+ stars' },
            { value: '3', label: '3+ stars' },
            { value: '2', label: '2+ stars' },
          ]}
        />
      </div>
      <div className="min-w-0 sm:col-span-2 lg:col-span-1">
        {fl('Consultation fee (PKR)')}
        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0 flex-1">
            <Select
              value={minFee}
              onChange={(e) => setMinFee(e.target.value)}
              className={selectTall}
              options={[
                { value: '', label: 'Min' },
                { value: '0', label: '0+' },
                { value: '3000', label: '3,000+' },
                { value: '8000', label: '8,000+' },
                { value: '15000', label: '15,000+' },
              ]}
            />
          </div>
          <div className="min-w-0 flex-1">
            <Select
              value={maxFee}
              onChange={(e) => setMaxFee(e.target.value)}
              className={selectTall}
              options={[
                { value: '', label: 'Max' },
                { value: '5000', label: '≤ 5,000' },
                { value: '15000', label: '≤ 15,000' },
                { value: '30000', label: '≤ 30,000' },
                { value: '75000', label: '≤ 75,000' },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );

  const advancedFiltersJsx = (
    <div className={advancedGridClass}>
      <div className="min-w-0">
        {fl('Search radius')}
        <Select
          value={radius}
          onChange={(e) => setRadius(e.target.value)}
          className={selectTall}
          options={[
            { value: '5', label: '5 km' },
            { value: '10', label: '10 km' },
            { value: '20', label: '20 km' },
            { value: '50', label: '50 km' },
          ]}
        />
      </div>
      <div className="min-w-0">
        {fl('Sort by')}
        <Select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className={selectTall}
          options={[
            { value: 'rating', label: 'Highest rated' },
            { value: 'reviews', label: 'Most reviews' },
            { value: 'experience', label: 'Most experience' },
            { value: 'fee', label: 'Lowest fee' },
            ...(latitude && longitude ? [{ value: 'distance', label: 'Closest first' }] : []),
          ]}
        />
      </div>
      <div className="min-w-0">
        {fl('Min experience (years)')}
        <Select
          value={minExperience}
          onChange={(e) => setMinExperience(e.target.value)}
          className={selectTall}
          options={[
            { value: '', label: 'Any' },
            { value: '1', label: '1+' },
            { value: '3', label: '3+' },
            { value: '5', label: '5+' },
            { value: '10', label: '10+' },
          ]}
        />
      </div>
      <div className="min-w-0">
        {fl('Max experience (years)')}
        <Select
          value={maxExperience}
          onChange={(e) => setMaxExperience(e.target.value)}
          className={selectTall}
          options={[
            { value: '', label: 'Any' },
            { value: '5', label: '≤ 5' },
            { value: '10', label: '≤ 10' },
            { value: '20', label: '≤ 20' },
          ]}
        />
      </div>
    </div>
  );

  const locationHintJsx = (
    <>
      {locationError ? <p className="mt-3 text-sm text-lk-danger">{locationError}</p> : null}
      {latitude && longitude && !locationError ? (
        <p className="mt-3 text-xs leading-relaxed text-emerald-800">
          Searching within <span className="tabular-nums font-semibold">{radius || '10'}</span> km — pick &ldquo;Closest first&rdquo; in Sort when
          you want distance order.
        </p>
      ) : null}
    </>
  );

  const filtersCardJsx = (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-lk-card-md ring-1 ring-slate-100/80 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <h2 className="text-sm font-bold text-lk-navy sm:text-base">Filters</h2>
        <div className="flex flex-wrap items-center gap-2">
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-lk-accent ring-1 ring-blue-100">
              {activeFilterCount} active
            </span>
          )}
          {hasActiveFilters ? (
            <button type="button" className="text-sm font-semibold text-lk-muted hover:text-lk-danger" onClick={clearFilters}>
              Clear all
            </button>
          ) : null}
        </div>
      </div>
      <div className="pt-4">{primaryFiltersFieldsJsx}</div>
      <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:flex-wrap sm:items-center">
        <Button type="button" size="md" className="min-h-[42px] w-full sm:min-w-[148px] sm:w-auto" onClick={applyFilters} leftIcon={<FiSearch />}>
          Search lawyers
        </Button>
        <Button
          type="button"
          variant="outline"
          size="md"
          className="min-h-[42px] w-full sm:w-auto"
          onClick={handleUseMyLocation}
          leftIcon={<FiMapPin />}
        >
          My location
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="md"
          className="min-h-[42px] w-full text-lk-navy sm:ml-auto sm:w-auto"
          onClick={() => setMoreFiltersOpen((o) => !o)}
          rightIcon={<FiChevronDown className={`transition-transform ${moreFiltersOpen ? 'rotate-180' : ''}`} aria-hidden />}
        >
          More filters
        </Button>
      </div>
      {moreFiltersOpen ? <div className="mt-4 border-t border-slate-100 pt-4">{advancedFiltersJsx}</div> : null}
      {locationHintJsx}
      {filterChips.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Applied</span>
          {filterChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => removeChip(chip.id)}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-1 text-xs font-medium text-lk-navy transition hover:border-lk-accent/40 hover:bg-blue-50"
            >
              <span className="truncate">{chip.label}</span>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-white hover:text-lk-navy" aria-hidden>
                <FiX className="h-3 w-3" />
              </span>
            </button>
          ))}
          <button type="button" onClick={clearFilters} className="text-xs font-semibold text-lk-accent hover:underline">
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );

  const mobileDrawerFiltersJsx = (
    <div className="space-y-5">
      <div className="flex flex-col gap-4">{primaryFiltersFieldsJsx}</div>
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-lk-muted">Advanced</p>
        <div className="rounded-xl border border-lk-border bg-[#F8FAFC] p-4">{advancedFiltersJsx}</div>
      </div>
      {locationHintJsx}
    </div>
  );

  return (
    <div className={`flex min-h-screen flex-col bg-lk-canvas`}>
      {!isInDashboard && <Navbar />}

      <section
        className={`relative overflow-hidden border-b border-lk-border text-white ${
          isInDashboard
            ? 'bg-gradient-to-br from-lk-navy via-slate-900 to-slate-800 py-6 sm:py-8'
            : 'bg-gradient-to-br from-[#060d18] via-lk-navy to-[#143d6e] py-10 sm:py-12 lg:py-14'
        }`}
      >
        {!isInDashboard && (
          <>
            <div className="pointer-events-none absolute left-1/2 top-[-40%] h-[min(380px,70vw)] w-[min(380px,70vw)] -translate-x-1/2 rounded-full bg-[#2563EB]/11 blur-[90px]" />
            <div className="pointer-events-none absolute -right-16 top-0 h-52 w-52 rounded-full bg-lk-accent/22 blur-3xl" />
            <div className="pointer-events-none absolute bottom-0 left-1/3 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.055]"
              style={{
                backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)',
                backgroundSize: '22px 22px',
              }}
            />
          </>
        )}
        <div className={`${isInDashboard ? 'mx-auto w-full max-w-wide px-4 lg:px-8' : 'relative lk-page-wide'}`}>
          {!isInDashboard ? (
            <>
              <p
                className="lk-hero-enter mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/90 ring-1 ring-white/15"
                style={{ animationDelay: '0.06s' }}
              >
                <FiShield className="text-emerald-300" />
                Verified directory
              </p>
              <h1
                className="lk-hero-enter font-bold tracking-tight text-white text-2xl sm:text-[2rem] lg:text-3xl"
                style={{ animationDelay: '0.14s' }}
              >
                Find a lawyer
              </h1>
              <p
                className="lk-hero-enter mt-2 max-w-2xl text-xs leading-relaxed text-white/80 sm:text-sm lg:text-base"
                style={{ animationDelay: '0.22s' }}
              >
                Filter the verified directory by practice area, city, and consultation fee bands.
              </p>
            </>
          ) : null}

          <div
            className={`max-w-full ${isInDashboard ? 'mt-0' : 'lk-hero-enter mt-5'}`}
            style={!isInDashboard ? { animationDelay: '0.3s' } : undefined}
          >
            <div className="hidden max-w-full md:block">{filtersCardJsx}</div>

            <div className="space-y-3 md:hidden">
              <p className="text-[11px] leading-relaxed text-white/75">
                Tap <span className="font-semibold text-white/90">Filters</span> for practice area, city, rating, fees, and advanced options.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  className="min-h-[48px] min-w-[min(100%,160px)] flex-1 border-white/35 bg-white/10 text-white hover:bg-white/20"
                  onClick={() => setFilterDrawerOpen(true)}
                  leftIcon={<FiFilter />}
                >
                  Filters
                  {activeFilterCount > 0 ? (
                    <span className="ml-2 rounded-full bg-lk-accent px-2 py-0.5 text-[11px] font-bold text-white">{activeFilterCount}</span>
                  ) : null}
                </Button>
                <Button type="button" size="md" className="min-h-[48px] shrink-0" onClick={applyFilters} leftIcon={<FiSearch />}>
                  Search
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  className="min-h-[48px] shrink-0 border-white/35 bg-white/10 text-white hover:bg-white/20"
                  onClick={handleUseMyLocation}
                  leftIcon={<FiMapPin />}
                >
                  My location
                </Button>
              </div>
              {hasActiveFilters ? (
                <button type="button" className="text-xs font-semibold text-white/90 underline decoration-white/40 hover:text-white" onClick={clearFilters}>
                  Clear all
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <FindLawyersAiGuidanceCta isDashboard={isInDashboard} />

      <div className={isInDashboard ? 'mx-auto w-full max-w-wide px-4 py-6 lg:px-8 lg:py-8' : 'lk-page-wide py-6 lg:py-8'}>

        {/* Mobile filter drawer */}
        {filterDrawerOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-[60] bg-lk-navy/45 backdrop-blur-[2px] md:hidden"
              aria-label="Close filters"
              onClick={() => setFilterDrawerOpen(false)}
            />
            <div
              className="fixed inset-y-0 right-0 z-[70] flex w-[min(100vw,420px)] max-w-full flex-col border-l border-lk-border bg-lk-surface shadow-lk-card-lg md:hidden"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-filters-title"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-lk-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <h2 id="mobile-filters-title" className="text-base font-semibold text-lk-navy">
                    Filters
                  </h2>
                  {activeFilterCount > 0 && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-lk-accent">{activeFilterCount} active</span>
                  )}
                </div>
                <button type="button" className="rounded-xl p-2 text-lk-muted hover:bg-slate-100 hover:text-lk-navy" onClick={() => setFilterDrawerOpen(false)} aria-label="Close">
                  <FiX className="h-5 w-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-2">{mobileDrawerFiltersJsx}</div>
              <div className="shrink-0 border-t border-lk-border bg-lk-surface p-4 pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  {hasActiveFilters ? (
                    <Button type="button" variant="ghost" size="md" className="w-full sm:w-auto sm:order-1" onClick={clearFilters}>
                      Clear all
                    </Button>
                  ) : null}
                  <Button type="button" size="md" className="w-full sm:min-w-[140px] sm:flex-1" onClick={applyFilters} leftIcon={<FiSearch />}>
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="min-w-0 flex-1 overflow-x-hidden">
          {/* Mobile filters trigger (duplicate for visibility next to results) */}
          <div className={`mb-4 flex items-center justify-between gap-3 md:hidden`}>
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setFilterDrawerOpen(true)} leftIcon={<FiFilter />}>
              Filters
              {activeFilterCount > 0 ? (
                <span className="ml-2 rounded-full bg-lk-accent px-2 py-0.5 text-[11px] font-bold text-white">{activeFilterCount}</span>
              ) : null}
            </Button>
            <p className="truncate text-right text-xs text-lk-muted">{loading ? 'Loading…' : `${pagination.total} verified`}</p>
          </div>

          {latitude && longitude && (
            <div className="mb-4 rounded-xl border border-lk-border bg-blue-50/90 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-lk-navy sm:text-sm">
                <FiMapPin className="shrink-0 text-lk-accent" />
                <span>
                  Within <strong>{radius || '10'} km</strong>, sorted by {sortBy === 'distance' ? 'distance' : 'your sort preference'}.
                </span>
              </div>
            </div>
          )}

          {filterChips.length > 0 && (
            <div className={`mb-4 flex flex-wrap items-center gap-2 md:hidden`}>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-lk-muted">Active</span>
              {filterChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => removeChip(chip.id)}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-lk-border bg-white py-1 pl-2.5 pr-1 text-xs font-medium text-lk-navy shadow-sm transition hover:border-lk-accent/40 hover:bg-blue-50"
                >
                  <span className="truncate">{chip.label}</span>
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-lk-muted hover:bg-slate-100 hover:text-lk-navy" aria-hidden>
                    <FiX className="h-3 w-3" />
                  </span>
                </button>
              ))}
              <button type="button" onClick={clearFilters} className="text-xs font-semibold text-lk-accent hover:underline">
                Clear all
              </button>
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-lk-muted">{loading ? 'Loading lawyers…' : `${pagination.total} verified lawyers match`}</p>
          </div>

          {loading ? (
            <div className={getLawyerResultsGridClass(4)}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="animate-pulse rounded-2xl border border-lk-border bg-lk-surface p-5 shadow-lk-card">
                  <div className="flex gap-4">
                    <div className="h-16 w-16 rounded-full bg-slate-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-5 w-2/3 rounded bg-slate-200" />
                      <div className="h-4 w-1/2 rounded bg-slate-200" />
                    </div>
                  </div>
                  <div className="mt-4 h-10 rounded-lg bg-slate-100" />
                </div>
              ))}
            </div>
          ) : lawyers.length === 0 ? (
            <Card className="border border-dashed border-lk-border py-14 text-center shadow-lk-card">
              <FiShield className="mx-auto mb-4 text-5xl text-lk-border" />
              <h3 className="text-lg font-semibold text-lk-navy sm:text-xl">No verified lawyers found</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-lk-muted">
                Broaden your filters or reset to see more verified lawyers.
              </p>
              <Button type="button" className="mt-6" variant="outline" onClick={clearFilters}>
                Reset filters
              </Button>
            </Card>
          ) : (
            <div className={getLawyerResultsGridClass(lawyers.length)}>
              {lawyers.map((lawyer) => (
                <LawyerCard key={lawyer._id} lawyer={lawyer} />
              ))}
            </div>
          )}

          {pagination.totalPages > 1 && (
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams(searchParams);
                    params.set('page', String(page));
                    setSearchParams(params);
                  }}
                  className={`flex h-10 min-w-[40px] items-center justify-center rounded-xl text-sm font-semibold transition ${
                    page === pagination.page ? 'bg-lk-accent text-white shadow-md shadow-lk-accent/25' : 'border border-lk-border bg-lk-surface text-lk-navy hover:bg-slate-50'
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {!isInDashboard && <Footer />}
    </div>
  );
}

/** Few results → 2 columns; many → up to 3 per row on wide screens. */
function getLawyerResultsGridClass(count: number) {
  if (count <= 2) return 'grid grid-cols-1 gap-5 sm:grid-cols-2';
  if (count <= 4) return 'grid grid-cols-1 gap-5 md:grid-cols-2';
  return 'grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3';
}

function LawyerCard({ lawyer }: { lawyer: any }) {
  const loc = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { isCitizen } = useRole();
  const profile = lawyer.lawyerProfile;
  const isVerified = profile?.verificationStatus === 'verified';
  const isInDashboard = loc.pathname === '/client/find-lawyer';
  const profilePath = isInDashboard ? `/client/lawyers/${lawyer._id}` : `/lawyers/${lawyer._id}`;
  const profilePictureUrl = profile?.profilePictureUrl;

  const book = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated || !isCitizen) {
      navigate('/auth/citizen/login');
      return;
    }
    navigate(`/client/appointments/book/${lawyer._id}`);
  };

  return (
    <article className="lk-card-lift flex h-full flex-col overflow-hidden rounded-2xl border border-blue-200/70 bg-gradient-to-br from-blue-50/45 via-white to-slate-50/50 p-3 shadow-[0_12px_32px_-16px_rgba(15,23,42,0.16)] ring-1 ring-blue-200/45 transition duration-300 hover:border-blue-300/80 hover:shadow-[0_16px_40px_-14px_rgba(15,23,42,0.2)]">
      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-100 bg-white/95 p-3 shadow-sm ring-1 ring-slate-100/80">
        <div className="flex items-start gap-3">
          <Avatar src={profilePictureUrl} name={profile?.fullName} size="lg" className="shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="truncate text-sm font-bold text-lk-navy sm:text-base">{profile?.fullName || 'Lawyer'}</h3>
              {isVerified && (
                <Badge variant="success" className="shrink-0 text-[10px]">
                  <FiCheckCircle className="mr-0.5 inline opacity-90" />
                  Verified
                </Badge>
              )}
              {lawyer.distanceKm != null && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#eef3fb] px-2 py-0.5 text-[10px] font-semibold text-lk-navy ring-1 ring-[#b8c9e8]/80">
                  <FiMapPin className="text-[9px]" /> {lawyer.distanceKm.toFixed(1)} km
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-lk-muted">
              <span className="inline-flex items-center gap-1">
                <FiMapPin className="shrink-0 opacity-70" />
                {profile?.city || 'Pakistan'}
              </span>
              <span className="mx-1.5 text-slate-300">·</span>
              <span>{profile?.yearsOfExperience ?? 0} yrs experience</span>
            </p>
            <div className="mt-1.5">
              <Rating value={profile?.averageRating || 0} size="sm" showValue reviewCount={profile?.totalReviews} />
            </div>
          </div>
        </div>

        <div className="mt-3 flex min-h-[1.75rem] flex-wrap gap-1">
          {profile?.practiceAreas?.slice(0, 3).map((area: string) => (
            <span
              key={area}
              className="rounded-full bg-[#eef3fb] px-2 py-0.5 text-[10px] font-medium text-lk-navy ring-1 ring-[#b8c9e8]/70"
            >
              {area}
            </span>
          ))}
          {profile?.practiceAreas?.length > 3 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-lk-muted ring-1 ring-slate-200/80">
              +{profile.practiceAreas.length - 3}
            </span>
          )}
        </div>

        <span className="mt-3 inline-flex w-fit items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200/80">
          <FiVideo className="text-emerald-700" aria-hidden />
          Online consultation
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-4 border-t border-white/60 pt-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-lk-muted">Consultation fee</p>
          <p className="text-base font-bold tabular-nums text-lk-navy sm:text-lg">
            PKR {(profile?.consultationFee || 0).toLocaleString()}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
          <Link to={profilePath} className="inline-flex">
            <Button type="button" variant="outline" size="sm" className="h-9 whitespace-nowrap px-4">
              View profile
            </Button>
          </Link>
          <Button
            type="button"
            size="sm"
            className="h-9 whitespace-nowrap px-4"
            leftIcon={<FiCalendar />}
            onClick={book}
          >
            Book
          </Button>
        </div>
      </div>
    </article>
  );
}
