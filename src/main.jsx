import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  Search, Heart, ShoppingCart, Menu, ArrowRight, Star, ShieldCheck, Truck, RotateCcw,
  Headphones, X, Minus, Plus, ChevronLeft, Check, Home, Grid2X2, Trash2, Settings,
  LogOut, Package, LayoutDashboard, ShoppingBag, Upload, Save, Pencil, Eye, EyeOff, MapPin, Clock3, Send, Instagram, MessageCircle, UserRound, Grid3X3, SlidersHorizontal, ArrowUpDown, Rows3, ChevronDown, Scale, BadgeCheck, Box, Store as StoreIcon, Phone, XCircle, Info, BatteryCharging, Gauge, CircleDot, Wrench, Layers3, Ruler, Zap, PackageOpen
} from 'lucide-react';
import './styles.css';
import './stage7.css';
import { getProducts, getCategories, adminLogin, addProduct, editProduct, removeProduct, uploadImage, createOrder } from './api';

const rub=n=>new Intl.NumberFormat('ru-RU').format(Number(n||0))+' ₽';

function DrillCursor({page}){
  React.useEffect(()=>{
    const cursor=document.querySelector('.zona-arrow-cursor');
    if(!cursor)return;

    const move=e=>{
      cursor.style.transform=`translate3d(${e.clientX}px,${e.clientY}px,0)`;
      cursor.classList.add('visible');
    };

    const click=e=>{
      cursor.classList.add('pressed');

      const fx=document.createElement('div');
      fx.className='zona-click-fx';
      fx.style.left=e.clientX+'px';
      fx.style.top=e.clientY+'px';

      for(let i=0;i<16;i++){
        const spark=document.createElement('span');
        spark.className='zona-spark';
        const a=(Math.PI*2*i/16)+(Math.random()*.2);
        const d=24+Math.random()*55;
        spark.style.setProperty('--x',`${Math.cos(a)*d}px`);
        spark.style.setProperty('--y',`${Math.sin(a)*d}px`);
        spark.style.setProperty('--r',`${Math.random()*160-80}deg`);
        fx.appendChild(spark);
      }

      for(let i=0;i<8;i++){
        const dust=document.createElement('span');
        dust.className='zona-dust';
        dust.style.setProperty('--dx',`${(Math.random()-.5)*80}px`);
        dust.style.setProperty('--dy',`${-8-Math.random()*48}px`);
        dust.style.animationDelay=`${i*18}ms`;
        fx.appendChild(dust);
      }

      const flash=document.createElement('span');
      flash.className='zona-flash';
      fx.appendChild(flash);

      document.body.appendChild(fx);

      setTimeout(()=>cursor.classList.remove('pressed'),120);
      setTimeout(()=>fx.remove(),800);
    };

    const leave=()=>cursor.classList.remove('visible');

    window.addEventListener('pointermove',move,{passive:true});
    window.addEventListener('click',click);
    document.addEventListener('mouseleave',leave);

    return()=>{
      window.removeEventListener('pointermove',move);
      window.removeEventListener('click',click);
      document.removeEventListener('mouseleave',leave);
    };
  },[page]);

  return <div className="zona-arrow-cursor" aria-hidden="true">
    <svg className="zona-arrow-svg" viewBox="0 0 120 150">
      <path className="zona-arrow-outline" d="M10 5 L112 91 Q117 96 113 101 Q110 105 104 102 L48 70 L38 143 Q37 149 31 149 Q25 149 25 143 L24 69 L15 69 Q9 69 9 63 Z"/>
      <path className="zona-arrow-fill" d="M19 17 L101 86 L47 55 L35 130 L34 55 L25 55 Z"/>
      <path className="zona-arrow-highlight" d="M24 22 L35 31 L35 53 L25 53 Z"/>
    </svg>
  </div>
}

const categoryIcons = {
  'Шуруповёрты':'/tool-drill.svg',
  'Перфораторы':'/tool-hammer.svg',
  'Болгарки':'/tool-grinder.svg',
  'Дрели':'/tool-drill.svg',
  'Лобзики':'/tool-jigsaw.svg',
  'Компрессоры':'/tool-compressor.svg',
  'Сварка':'/tool-welder.svg',
  'Измерение':'/tool-measure.svg',
};



function productImages(p){
  const arr=Array.isArray(p.images)?p.images.filter(Boolean):[];
  if(p.image_url && !arr.includes(p.image_url)) arr.unshift(p.image_url);
  if(!arr.length) arr.push(categoryIcons[p.category] || '/tool-drill.svg');
  return arr;
}
function productImage(p){
  return productImages(p)[0];
}


const categorySpecConfig = {
  'Шуруповёрты': [
    {key:'voltage',label:'Напряжение',type:'select'},
    {key:'torque',label:'Крутящий момент',type:'number',unit:'Нм'},
    {key:'battery_count',label:'Количество АКБ',type:'select'},
    {key:'chuck',label:'Патрон',type:'select'},
    {key:'power_type',label:'Тип питания',type:'select'},
  ],
  'Перфораторы': [
    {key:'power',label:'Мощность',type:'number',unit:'Вт'},
    {key:'impact_energy',label:'Энергия удара',type:'number',unit:'Дж'},
    {key:'chuck',label:'Патрон',type:'select'},
    {key:'modes',label:'Режимов работы',type:'select'},
  ],
  'Болгарки': [
    {key:'power',label:'Мощность',type:'number',unit:'Вт'},
    {key:'disc_diameter',label:'Диаметр диска',type:'select',unit:'мм'},
    {key:'speed_control',label:'Регулировка оборотов',type:'boolean'},
    {key:'soft_start',label:'Плавный пуск',type:'boolean'},
  ],
  'Дрели': [
    {key:'power',label:'Мощность',type:'number',unit:'Вт'},
    {key:'chuck_size',label:'Патрон',type:'select',unit:'мм'},
    {key:'impact',label:'Ударный режим',type:'boolean'},
    {key:'reverse',label:'Реверс',type:'boolean'},
  ],
  'Лобзики': [
    {key:'power',label:'Мощность',type:'number',unit:'Вт'},
    {key:'cut_depth',label:'Глубина пропила',type:'number',unit:'мм'},
    {key:'pendulum',label:'Маятниковый ход',type:'boolean'},
  ],
  'Компрессоры': [
    {key:'tank',label:'Ресивер',type:'number',unit:'л'},
    {key:'pressure',label:'Давление',type:'number',unit:'бар'},
    {key:'performance',label:'Производительность',type:'number',unit:'л/мин'},
  ],
  'Сварка': [
    {key:'max_current',label:'Макс. ток',type:'number',unit:'А'},
    {key:'welding_type',label:'Тип сварки',type:'select'},
  ],
  'Измерение': [
    {key:'range',label:'Дальность',type:'number',unit:'м'},
    {key:'laser_color',label:'Цвет лазера',type:'select'},
    {key:'lines',label:'Количество линий',type:'select'},
  ],
};

function inferredSpecs(p){
  const out={...(p.specs||{})};
  const text=(p.spec||'').toLowerCase();
  const n=(regex)=>{const m=text.match(regex);return m?Number(String(m[1]).replace(',','.')):undefined};
  if(!out.voltage){const v=n(/(\d+)\s*v/);if(v)out.voltage=v+'V'}
  if(!out.torque){const v=n(/(\d+(?:[.,]\d+)?)\s*нм/);if(v)out.torque=v}
  if(!out.power){const v=n(/(\d+)\s*вт/);if(v)out.power=v}
  if(!out.impact_energy){const v=n(/(\d+(?:[.,]\d+)?)\s*дж/);if(v)out.impact_energy=v}
  if(!out.disc_diameter){const v=n(/(\d+)\s*мм/);if(v&&p.category==='Болгарки')out.disc_diameter=v}
  if(!out.chuck_size){const v=n(/(\d+)\s*мм/);if(v&&p.category==='Дрели')out.chuck_size=v}
  if(!out.tank){const v=n(/(\d+)\s*л/);if(v&&p.category==='Компрессоры')out.tank=v}
  if(!out.pressure){const v=n(/(\d+(?:[.,]\d+)?)\s*бар/);if(v)out.pressure=v}
  if(!out.max_current){const m=text.match(/(\d+)\s*а/);if(m&&p.category==='Сварка')out.max_current=Number(m[1])}
  return out;
}

function specValue(p,key){
  return inferredSpecs(p)[key];
}

function displaySpecValue(value, cfg){
  if(value===undefined||value===null||value==='')return '—';
  if(cfg?.type==='boolean') return value===true||value==='true'?'Да':'Нет';
  return `${value}${cfg?.unit?' '+cfg.unit:''}`;
}

function uniqueSpecValues(products,key){
  return [...new Set(products.map(p=>specValue(p,key)).filter(v=>v!==undefined&&v!==null&&v!==''))].sort((a,b)=>String(a).localeCompare(String(b),'ru',{numeric:true}));
}


function ProductCard({p,index=0,open,add,favs,toggleFav,compare,toggleCompare,view='grid'}){
  const fav=favs.includes(p.id);
  const compared=compare.includes(p.id);
  return <article role="button" tabIndex={0} className={`commerce-product glass interactive-card ${view==='list'?'list-view':''}`} onClick={()=>open(p)} onKeyDown={e=>{if(e.key==="Enter")open(p)}}>
    <div className="commerce-product-top">
      <span className="commerce-badge">{p.badge||'ZONA'}</span>
      <div className="card-actions">
        <button className={compared?'active':''} title="Сравнить" onClick={e=>{e.stopPropagation();toggleCompare(p.id)}}><Scale size={17}/></button>
        <button className={fav?'active':''} title="Избранное" onClick={e=>{e.stopPropagation();toggleFav(p.id)}}><Heart size={18} fill={fav?'currentColor':'none'}/></button>
      </div>
    </div>
    <div className="commerce-product-image">
      <img src={productImage(p)} alt={p.title}/>
    </div>
    <div className="commerce-product-body">
      <div className="commerce-rating"><Star size={14} fill="currentColor"/><b>{p.rating||4.9}</b><span>{p.reviews||0} отзывов</span></div>
      <h3>{p.title}</h3>
      <p className="commerce-spec">{p.spec}</p>
      <div className="commerce-delivery"><Check size={13}/> В наличии: {p.stock} шт.</div>
      <div className="commerce-price"><strong>{rub(p.price)}</strong>{Number(p.old_price)>Number(p.price)&&<del>{rub(p.old_price)}</del>}</div>
      <div className="commerce-card-buttons">
        <button type="button" className="primary" onClick={e=>{e.stopPropagation();add(p)}}><ShoppingCart size={17}/> В корзину</button>
        <button type="button" className="quick-buy" onClick={e=>{e.stopPropagation();open(p)}}>Подробнее</button>
      </div>
    </div>
  </article>
}

function CommerceHeader({page,setPage,query,setQuery,cartCount,openCart,favCount,compareCount,setAdmin}){
  return <>
    <div className="commerce-topbar">
      <div><MapPin size={13}/> Хасавюрт</div>
      <nav><button>Магазин</button><button>Доставка и оплата</button><button>Гарантия</button><button>Контакты</button></nav>
      <div className="commerce-phone"><Phone size={13}/> 8 (988) 800-05-05</div>
    </div>
    <header className="commerce-header glass">
      <button className="commerce-logo" onClick={()=>setPage('home')}><img src="/zona-logo.png"/></button>
      <button className="commerce-catalog-button" onClick={()=>setPage('catalog')}><Menu size={20}/> Каталог</button>
      <form className="commerce-search" onSubmit={e=>{e.preventDefault();setPage('catalog')}}>
        <Search size={20}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск по товарам и категориям"/>
        {query&&<button type="button" onClick={()=>setQuery('')}><X size={16}/></button>}
      </form>
      <div className="commerce-actions">
        <button onClick={()=>setPage('compare')}><Scale/><span>Сравнение</span>{compareCount>0&&<i>{compareCount}</i>}</button>
        <button onClick={()=>setPage('favorites')}><Heart/><span>Избранное</span>{favCount>0&&<i>{favCount}</i>}</button>
        <button onClick={openCart}><ShoppingCart/><span>Корзина</span>{cartCount>0&&<i>{cartCount}</i>}</button>
        <button onClick={()=>setAdmin(true)}><UserRound/><span>Войти</span></button>
      </div>
    </header>
    <nav className="commerce-quick-nav">
      <button onClick={()=>setPage('catalog')}>Акции</button>
      <button onClick={()=>setPage('catalog')}>Новинки</button>
      <button onClick={()=>setPage('catalog')}>Электроинструмент</button>
      <button onClick={()=>setPage('catalog')}>Расходные материалы</button>
      <button onClick={()=>setPage('catalog')}>Силовая техника</button>
      <button onClick={()=>setPage('catalog')}>Измерительный инструмент</button>
    </nav>
  </>
}

function HomePage({products,categories,setPage,open,add,favs,toggleFav,compare,toggleCompare}){
  return <>
    <section className="commerce-hero">
      <div className="commerce-hero-main glass">
        <div className="hero-content">
          <span className="hero-kicker">ZONA • ЭЛЕКТРОИНСТРУМЕНТЫ</span>
          <h1>Инструменты для работы,<br/><em>которым можно доверять</em></h1>
          <p>Подберём инструмент для дома, стройки и профессиональной работы.</p>
          <div className="hero-actions">
            <button className="primary" onClick={()=>setPage('catalog')}>Перейти в каталог <ArrowRight size={18}/></button>
            <button className="hero-secondary">Помочь с выбором</button>
          </div>
          <div className="hero-trust">
            <span><BadgeCheck/>Гарантия</span><span><StoreIcon/>Самовывоз</span><span><Truck/>Доставка</span>
          </div>
        </div>
        <div className="hero-tool-art">
          <div className="hero-circle"></div>
          <img src="/tool-drill.svg"/>
          <div className="hero-float h1">18V</div>
          <div className="hero-float h2">60 Нм</div>
          <div className="hero-float h3">2 АКБ</div>
        </div>
      </div>
      <aside className="hero-side">
        <div className="hero-side-card glass">
          <span>Акция недели</span><strong>-20%</strong><p>на выбранный электроинструмент</p><button onClick={()=>setPage('catalog')}>Смотреть товары →</button>
        </div>
        <div className="hero-side-card glass compact"><Truck/><div><b>Быстрая доставка</b><small>По Хасавюрту и Дагестану</small></div></div>
      </aside>
    </section>

    <section className="home-section">
      <div className="home-section-head"><div><span>КАТАЛОГ</span><h2>Популярные категории</h2></div><button onClick={()=>setPage('catalog')}>Все категории <ArrowRight size={16}/></button></div>
      <div className="commerce-categories">
        {categories.slice(0,8).map(c=><button key={c.id||c.name} className="commerce-category glass interactive-card" onClick={()=>{setPage('catalog');}}>
          <div><img src={categoryIcons[c.name]||'/tool-drill.svg'}/></div><span>{c.name}</span><small>Перейти →</small>
        </button>)}
      </div>
    </section>

    <section className="home-section">
      <div className="home-section-head"><div><span>ПОПУЛЯРНОЕ</span><h2>Хиты продаж</h2></div><button onClick={()=>setPage('catalog')}>Смотреть все <ArrowRight size={16}/></button></div>
      <div className="commerce-grid home-grid">
        {products.slice(0,5).map((p,i)=><ProductCard key={p.id} p={p} index={i} open={open} add={add} favs={favs} toggleFav={toggleFav} compare={compare} toggleCompare={toggleCompare}/>)}
      </div>
    </section>

    <section className="commerce-benefits glass">
      <div><BadgeCheck/><span><b>Оригинальная продукция</b><small>Гарантия на товары</small></span></div>
      <div><Truck/><span><b>Удобная доставка</b><small>Курьер и самовывоз</small></span></div>
      <div><RotateCcw/><span><b>Возврат 14 дней</b><small>По правилам магазина</small></span></div>
      <div><Headphones/><span><b>Помощь специалиста</b><small>Подберём инструмент</small></span></div>
    </section>
  </>
}

function FilterPanel({products,categories,cat,setCat,maxPrice,setMaxPrice,stockOnly,setStockOnly,minRating,setMinRating,specFilters,setSpecFilters,closeMobile}){
  const config=cat==='Все'?[]:(categorySpecConfig[cat]||[]);
  const scoped=cat==='Все'?products:products.filter(p=>p.category===cat);
  const setSpec=(key,val)=>setSpecFilters(x=>({...x,[key]:val}));

  return <aside className="filter-panel glass">
    <div className="filter-title"><b>Фильтры</b>{closeMobile&&<button onClick={closeMobile}><X/></button>}</div>
    <div className="filter-group">
      <label>Категория</label>
      <div className="filter-list">
        <button className={cat==='Все'?'active':''} onClick={()=>{setCat('Все');setSpecFilters({})}}>Все товары</button>
        {categories.map(c=><button className={cat===c.name?'active':''} key={c.id||c.name} onClick={()=>{setCat(c.name);setSpecFilters({})}}>{c.name}</button>)}
      </div>
    </div>
    <div className="filter-group">
      <label>Цена до <b>{rub(maxPrice)}</b></label>
      <input className="price-range" type="range" min="3000" max="50000" step="500" value={maxPrice} onChange={e=>setMaxPrice(+e.target.value)}/>
      <div className="range-labels"><span>3 000 ₽</span><span>50 000 ₽</span></div>
    </div>

    {config.map(cfg=><div className="filter-group smart-filter" key={cfg.key}>
      <label>{cfg.label}</label>
      {cfg.type==='boolean'
        ? <div className="smart-filter-buttons">
            <button className={specFilters[cfg.key]===true?'active':''} onClick={()=>setSpec(cfg.key,specFilters[cfg.key]===true?undefined:true)}>Да</button>
            <button className={specFilters[cfg.key]===false?'active':''} onClick={()=>setSpec(cfg.key,specFilters[cfg.key]===false?undefined:false)}>Нет</button>
          </div>
        : <div className="smart-filter-options">
            {uniqueSpecValues(scoped,cfg.key).slice(0,8).map(v=><button key={String(v)} className={String(specFilters[cfg.key])===String(v)?'active':''} onClick={()=>setSpec(cfg.key,String(specFilters[cfg.key])===String(v)?undefined:v)}>{displaySpecValue(v,cfg)}</button>)}
            {!uniqueSpecValues(scoped,cfg.key).length&&<small>Нет заполненных характеристик</small>}
          </div>}
    </div>)}

    <div className="filter-group">
      <label>Рейтинг</label>
      {[4.8,4.5,4.0].map(r=><button className={'rating-filter '+(minRating===r?'active':'')} key={r} onClick={()=>setMinRating(minRating===r?0:r)}><Star size={14} fill="currentColor"/> от {r}</button>)}
    </div>
    <label className="filter-switch"><span>Только в наличии</span><input type="checkbox" checked={stockOnly} onChange={e=>setStockOnly(e.target.checked)}/><i/></label>
  </aside>
}

function CatalogPage({products,categories,query,setQuery,open,add,favs,toggleFav,compare,toggleCompare}){
  const [cat,setCat]=React.useState('Все');
  const [maxPrice,setMaxPrice]=React.useState(50000);
  const [stockOnly,setStockOnly]=React.useState(false);
  const [minRating,setMinRating]=React.useState(0);
  const [sort,setSort]=React.useState('popular');
  const [view,setView]=React.useState('grid');
  const [mobileFilters,setMobileFilters]=React.useState(false);
  const [specFilters,setSpecFilters]=React.useState({});

  const filtered=React.useMemo(()=>{
    let x=products.filter(p=>
      (cat==='Все'||p.category===cat)&&
      (p.title.toLowerCase().includes(query.toLowerCase())||(p.spec||'').toLowerCase().includes(query.toLowerCase()))&&
      Number(p.price)<=maxPrice&&
      (!stockOnly||Number(p.stock)>0)&&
      Number(p.rating||0)>=minRating &&
      Object.entries(specFilters).every(([key,value])=>{
        if(value===undefined)return true;
        const pv=specValue(p,key);
        if(typeof value==='boolean')return Boolean(pv)===value;
        return String(pv)===String(value);
      })
    );
    if(sort==='cheap')x=[...x].sort((a,b)=>a.price-b.price);
    if(sort==='expensive')x=[...x].sort((a,b)=>b.price-a.price);
    if(sort==='rating')x=[...x].sort((a,b)=>(b.rating||0)-(a.rating||0));
    if(sort==='popular')x=[...x].sort((a,b)=>(b.reviews||0)-(a.reviews||0));
    return x;
  },[products,cat,query,maxPrice,stockOnly,minRating,sort,specFilters]);

  return <section className="catalog-page-v7">
    <div className="breadcrumbs"><button>Главная</button><span>›</span><b>Каталог</b></div>
    <div className="catalog-title-row"><div><h1>Электроинструменты</h1><p>{filtered.length} товаров</p></div><button className="mobile-filter-button" onClick={()=>setMobileFilters(true)}><SlidersHorizontal/> Фильтры</button></div>
    <div className="catalog-shell">
      <FilterPanel products={products} categories={categories} cat={cat} setCat={setCat} maxPrice={maxPrice} setMaxPrice={setMaxPrice} stockOnly={stockOnly} setStockOnly={setStockOnly} minRating={minRating} setMinRating={setMinRating} specFilters={specFilters} setSpecFilters={setSpecFilters}/>
      <div className="catalog-results">
        <div className="catalog-toolbar glass">
          <form className="catalog-search-v7" onSubmit={e=>e.preventDefault()}><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск в категории"/></form>
          <div className="sort-select"><ArrowUpDown size={16}/><select value={sort} onChange={e=>setSort(e.target.value)}><option value="popular">По популярности</option><option value="rating">По рейтингу</option><option value="cheap">Сначала дешевле</option><option value="expensive">Сначала дороже</option></select><ChevronDown/></div>
          <div className="view-buttons"><button className={view==='grid'?'active':''} onClick={()=>setView('grid')}><Grid2X2/></button><button className={view==='list'?'active':''} onClick={()=>setView('list')}><Rows3/></button></div>
        </div>
        {filtered.length?<div className={`commerce-grid catalog-product-grid ${view==='list'?'list-mode':''}`}>{filtered.map((p,i)=><ProductCard key={p.id} p={p} index={i} open={open} add={add} favs={favs} toggleFav={toggleFav} compare={compare} toggleCompare={toggleCompare} view={view}/>)}</div>:<div className="nothing-found glass"><Search/><h3>Товары не найдены</h3><p>Измени параметры фильтра или поисковый запрос.</p></div>}
      </div>
    </div>
    {mobileFilters&&<div className="mobile-filter-overlay"><div className="mobile-filter-backdrop" onClick={()=>setMobileFilters(false)}/><FilterPanel products={products} categories={categories} cat={cat} setCat={setCat} maxPrice={maxPrice} setMaxPrice={setMaxPrice} stockOnly={stockOnly} setStockOnly={setStockOnly} minRating={minRating} setMinRating={setMinRating} specFilters={specFilters} setSpecFilters={setSpecFilters} closeMobile={()=>setMobileFilters(false)}/></div>}
  </section>
}

function ProductPage({selected,products,open,add,favs,toggleFav,compare,toggleCompare,setPage}){
  const fav=favs.includes(selected.id),cmp=compare.includes(selected.id);
  const gallery=productImages(selected);
  const [activeImage,setActiveImage]=React.useState(0);
  React.useEffect(()=>setActiveImage(0),[selected.id]);
  const config=categorySpecConfig[selected.category]||[];
  const inferred=inferredSpecs(selected);
  const related=products.filter(p=>p.id!==selected.id&&p.category===selected.category).slice(0,4);
  const accessories=products.filter(p=>p.id!==selected.id&&p.category!==selected.category).slice(0,4);

  return <section className="product-page-v7 product-page-v9">
    <div className="breadcrumbs"><button onClick={()=>setPage('home')}>Главная</button><span>›</span><button onClick={()=>setPage('catalog')}>Каталог</button><span>›</span><b>{selected.category}</b></div>
    <div className="product-main-v7">
      <div className="product-gallery-v7 glass">
        <div className="gallery-main interactive-card"><img src={gallery[activeImage]||productImage(selected)}/></div>
        <div className="gallery-thumbs">{gallery.map((img,i)=><button className={i===activeImage?'active':''} key={img+i} onClick={()=>setActiveImage(i)}><img src={img}/></button>)}</div>
      </div>
      <div className="product-info-v7">
        <span className="product-category-label">{selected.category}</span>
        <h1>{selected.title}</h1>
        <div className="product-meta"><span><Star fill="currentColor"/> {selected.rating||4.9}</span><button>{selected.reviews||0} отзывов</button><span>Код товара: {selected.id}</span></div>

        <div className="v9-quick-specs">
          {config.slice(0,4).map(cfg=><div key={cfg.key}><span>{cfg.label}</span><b>{displaySpecValue(inferred[cfg.key],cfg)}</b></div>)}
          {!config.length&&(selected.spec||'').split('·').slice(0,4).map(x=><div key={x}><span>Характеристика</span><b>{x.trim()}</b></div>)}
        </div>

        <div className="purchase-box glass">
          <div className="purchase-stock"><Check/> В наличии <span>{selected.stock} шт.</span></div>
          <div className="purchase-price"><strong>{rub(selected.price)}</strong>{selected.old_price&&<del>{rub(selected.old_price)}</del>}</div>
          <button className="primary main-buy" onClick={()=>add(selected)}><ShoppingCart/> Добавить в корзину</button>
          <div className="secondary-actions"><button className={fav?'active':''} onClick={()=>toggleFav(selected.id)}><Heart fill={fav?'currentColor':'none'}/> В избранное</button><button className={cmp?'active':''} onClick={()=>toggleCompare(selected.id)}><Scale/> Сравнить</button></div>
        </div>
        <div className="purchase-services"><div><Truck/><span><b>Доставка</b><small>Сегодня / завтра</small></span></div><div><StoreIcon/><span><b>Самовывоз</b><small>Из магазина</small></span></div><div><ShieldCheck/><span><b>Гарантия</b><small>12 месяцев</small></span></div></div>
      </div>
    </div>

    <div className="product-tabs-v9">
      <section className="product-description glass">
        <div className="tab-title"><Info/><h2>Описание</h2></div>
        <p>{selected.description||'Описание товара будет добавлено администратором.'}</p>
      </section>
      <section className="product-description glass">
        <div className="tab-title"><Gauge/><h2>Характеристики</h2></div>
        <div className="spec-table">
          <div><span>Бренд</span><b>{selected.brand||'ZONA'}</b></div>
          <div><span>Категория</span><b>{selected.category}</b></div>
          {config.map(cfg=><div key={cfg.key}><span>{cfg.label}</span><b>{displaySpecValue(inferred[cfg.key],cfg)}</b></div>)}
          <div><span>Остаток</span><b>{selected.stock} шт.</b></div>
        </div>
      </section>
    </div>

    {related.length>0&&<section className="v9-related">
      <div className="home-section-head"><div><span>ПОХОЖИЕ</span><h2>Похожие товары</h2></div></div>
      <div className="commerce-grid">{related.map((p,i)=><ProductCard key={p.id} p={p} index={i} open={open} add={add} favs={favs} toggleFav={toggleFav} compare={compare} toggleCompare={toggleCompare}/>)}</div>
    </section>}

    {accessories.length>0&&<section className="v9-related">
      <div className="home-section-head"><div><span>ДОПОЛНИТЕЛЬНО</span><h2>С этим товаром смотрят</h2></div></div>
      <div className="commerce-grid">{accessories.map((p,i)=><ProductCard key={p.id} p={p} index={i} open={open} add={add} favs={favs} toggleFav={toggleFav} compare={compare} toggleCompare={toggleCompare}/>)}</div>
    </section>}
  </section>
}

function CollectionPage({title,items,open,add,favs,toggleFav,compare,toggleCompare,setPage,emptyIcon}){
  return <section className="collection-page"><div className="breadcrumbs"><button onClick={()=>setPage('home')}>Главная</button><span>›</span><b>{title}</b></div><h1>{title}</h1>{items.length?<div className="commerce-grid collection-grid">{items.map((p,i)=><ProductCard key={p.id} p={p} index={i} open={open} add={add} favs={favs} toggleFav={toggleFav} compare={compare} toggleCompare={toggleCompare}/>)}</div>:<div className="nothing-found glass">{emptyIcon}<h3>Здесь пока пусто</h3><p>Добавляй товары из каталога.</p><button className="primary" onClick={()=>setPage('catalog')}>Перейти в каталог</button></div>}</section>
}


function CheckoutPage({cart,setCart,setPage,onSuccess}){
  const [form,setForm]=React.useState({customer_name:'',customer_phone:'',customer_email:'',delivery_type:'pickup',delivery_address:'',payment_type:'cash',comment:''});
  const [loading,setLoading]=React.useState(false);
  const [error,setError]=React.useState('');
  const subtotal=cart.reduce((sum,x)=>sum+Number(x.price)*x.qty,0);
  const deliveryPrice=form.delivery_type==='delivery'&&subtotal<15000?500:0;
  const total=subtotal+deliveryPrice;
  const change=(key,value)=>setForm(x=>({...x,[key]:value}));

  const submit=async e=>{
    e.preventDefault(); setError('');
    if(!cart.length){setError('Корзина пуста');return}
    setLoading(true);
    try{
      const result=await createOrder({...form,items:cart.map(x=>({product_id:x.id,quantity:x.qty}))});
      setCart([]);
      onSuccess(result.order);
    }catch(err){setError(err.message)}
    finally{setLoading(false)}
  };

  return <section className="checkout-page">
    <div className="breadcrumbs"><button onClick={()=>setPage('home')}>Главная</button><span>›</span><button onClick={()=>setPage('catalog')}>Каталог</button><span>›</span><b>Оформление заказа</b></div>
    <div className="checkout-head"><h1>Оформление заказа</h1><span>{cart.reduce((a,b)=>a+b.qty,0)} товара</span></div>
    <form className="checkout-layout" onSubmit={submit}>
      <div className="checkout-fields">
        <section className="checkout-section glass">
          <div className="checkout-step">1</div><div className="checkout-section-content">
            <h2>Получатель</h2><p>Контактные данные для подтверждения заказа</p>
            <div className="checkout-input-grid">
              <label><span>Имя *</span><input required value={form.customer_name} onChange={e=>change('customer_name',e.target.value)} placeholder="Как к вам обращаться"/></label>
              <label><span>Телефон *</span><input required value={form.customer_phone} onChange={e=>change('customer_phone',e.target.value)} placeholder="+7 (___) ___-__-__"/></label>
              <label className="wide"><span>Email</span><input type="email" value={form.customer_email} onChange={e=>change('customer_email',e.target.value)} placeholder="Для информации о заказе"/></label>
            </div>
          </div>
        </section>
        <section className="checkout-section glass">
          <div className="checkout-step">2</div><div className="checkout-section-content">
            <h2>Получение</h2><p>Выберите удобный способ</p>
            <div className="choice-cards">
              <label className={form.delivery_type==='pickup'?'active':''}><input type="radio" name="delivery" checked={form.delivery_type==='pickup'} onChange={()=>change('delivery_type','pickup')}/><StoreIcon/><span><b>Самовывоз</b><small>Хасавюрт, ул. Тотурбиева 140</small><em>Бесплатно</em></span></label>
              <label className={form.delivery_type==='delivery'?'active':''}><input type="radio" name="delivery" checked={form.delivery_type==='delivery'} onChange={()=>change('delivery_type','delivery')}/><Truck/><span><b>Доставка</b><small>По Хасавюрту и району</small><em>{subtotal>=15000?'Бесплатно':'500 ₽'}</em></span></label>
            </div>
            {form.delivery_type==='delivery'&&<label className="checkout-address"><span>Адрес доставки *</span><input required value={form.delivery_address} onChange={e=>change('delivery_address',e.target.value)} placeholder="Улица, дом, квартира / ориентир"/></label>}
          </div>
        </section>
        <section className="checkout-section glass">
          <div className="checkout-step">3</div><div className="checkout-section-content">
            <h2>Оплата</h2><p>Оплата заказа при получении</p>
            <div className="choice-cards payment-cards">
              <label className={form.payment_type==='cash'?'active':''}><input type="radio" name="payment" checked={form.payment_type==='cash'} onChange={()=>change('payment_type','cash')}/><span><b>Наличными</b><small>При получении заказа</small></span></label>
              <label className={form.payment_type==='transfer'?'active':''}><input type="radio" name="payment" checked={form.payment_type==='transfer'} onChange={()=>change('payment_type','transfer')}/><span><b>Переводом</b><small>Реквизиты сообщит менеджер</small></span></label>
            </div>
            <label className="checkout-comment"><span>Комментарий к заказу</span><textarea value={form.comment} onChange={e=>change('comment',e.target.value)} placeholder="Например: позвонить за 30 минут до доставки"/></label>
          </div>
        </section>
      </div>
      <aside className="checkout-summary glass">
        <h2>Ваш заказ</h2>
        <div className="checkout-items">{cart.map(i=><div key={i.id} className="checkout-item"><img src={productImage(i)}/><div><b>{i.title}</b><small>{i.qty} × {rub(i.price)}</small></div><strong>{rub(Number(i.price)*i.qty)}</strong></div>)}</div>
        <div className="checkout-totals"><div><span>Товары</span><b>{rub(subtotal)}</b></div><div><span>Доставка</span><b>{deliveryPrice?rub(deliveryPrice):'Бесплатно'}</b></div><div className="grand"><span>Итого</span><b>{rub(total)}</b></div></div>
        {error&&<div className="checkout-error">{error}</div>}
        <button className="primary checkout-submit" disabled={loading||!cart.length}>{loading?'Оформляем…':'Оформить заказ'}</button>
        <p className="checkout-policy"><ShieldCheck/> Нажимая кнопку, вы подтверждаете данные заказа. Менеджер свяжется с вами для подтверждения.</p>
      </aside>
    </form>
  </section>
}

function OrderSuccess({order,setPage}){
  return <section className="order-success glass">
    <div className="success-icon"><Check/></div>
    <span className="eyebrow">ЗАКАЗ ПРИНЯТ</span>
    <h1>Спасибо за заказ!</h1>
    <p>Номер вашего заказа <b>{order?.order_number}</b>. Мы получили заявку и свяжемся с вами по телефону для подтверждения.</p>
    <div className="success-total"><span>Сумма заказа</span><strong>{rub(order?.total)}</strong></div>
    <div className="success-actions"><button className="primary" onClick={()=>setPage('catalog')}>Продолжить покупки</button><button className="ghost" onClick={()=>setPage('home')}>На главную</button></div>
  </section>
}



function ComparePage({items,setPage,remove}){
  const allKeys=[...new Set(items.flatMap(p=>(categorySpecConfig[p.category]||[]).map(x=>x.key)))];
  const cfgByKey={};
  items.forEach(p=>(categorySpecConfig[p.category]||[]).forEach(c=>cfgByKey[c.key]=c));
  if(!items.length)return <CollectionPage title="Сравнение" items={[]} open={()=>{}} add={()=>{}} favs={[]} toggleFav={()=>{}} compare={[]} toggleCompare={()=>{}} setPage={setPage} emptyIcon={<Scale size={42}/>}/>;
  return <section className="compare-page-v9">
    <div className="breadcrumbs"><button onClick={()=>setPage('home')}>Главная</button><span>›</span><b>Сравнение</b></div>
    <div className="compare-head"><h1>Сравнение товаров</h1><span>{items.length} товара</span></div>
    <div className="compare-table-wrap glass">
      <table className="compare-table">
        <thead><tr><th>Характеристика</th>{items.map(p=><th key={p.id}><button className="compare-remove" onClick={()=>remove(p.id)}><X/></button><img src={productImage(p)}/><b>{p.title}</b><strong>{rub(p.price)}</strong></th>)}</tr></thead>
        <tbody>
          <tr><td>Рейтинг</td>{items.map(p=><td key={p.id}><Star size={14} fill="currentColor"/> {p.rating||4.9}</td>)}</tr>
          <tr><td>Категория</td>{items.map(p=><td key={p.id}>{p.category}</td>)}</tr>
          {allKeys.map(key=><tr key={key}><td>{cfgByKey[key]?.label||key}</td>{items.map(p=><td key={p.id}>{displaySpecValue(specValue(p,key),cfgByKey[key])}</td>)}</tr>)}
          <tr><td>Наличие</td>{items.map(p=><td key={p.id}>{p.stock} шт.</td>)}</tr>
        </tbody>
      </table>
    </div>
  </section>
}


function Store({products,categories,setAdmin}){
  const [page,setPage]=React.useState('home');
  const [selected,setSelected]=React.useState(null);
  const [query,setQuery]=React.useState('');
  const [cart,setCart]=React.useState(()=>{try{return JSON.parse(localStorage.getItem('zona_cart')||'[]')}catch{return []}});
  const [cartOpen,setCartOpen]=React.useState(false);
  const [favs,setFavs]=React.useState(()=>{try{return JSON.parse(localStorage.getItem('zona_favs')||'[]')}catch{return []}});
  const [compare,setCompare]=React.useState(()=>{try{return JSON.parse(localStorage.getItem('zona_compare')||'[]')}catch{return []}});
  React.useEffect(()=>localStorage.setItem('zona_cart',JSON.stringify(cart)),[cart]);
  React.useEffect(()=>localStorage.setItem('zona_favs',JSON.stringify(favs)),[favs]);
  React.useEffect(()=>localStorage.setItem('zona_compare',JSON.stringify(compare)),[compare]);
  const [completedOrder,setCompletedOrder]=React.useState(null);

  const nav=p=>{setPage(p);window.scrollTo({top:0,behavior:'smooth'})};
  const open=p=>{setSelected(p);nav('product')};
  const add=p=>{setCart(x=>{const f=x.find(i=>i.id===p.id);return f?x.map(i=>i.id===p.id?{...i,qty:i.qty+1}:i):[...x,{...p,qty:1}]});setCartOpen(true)};
  const toggleFav=id=>setFavs(x=>x.includes(id)?x.filter(v=>v!==id):[...x,id]);
  const toggleCompare=id=>setCompare(x=>x.includes(id)?x.filter(v=>v!==id):[...x,id]);
  const count=cart.reduce((a,b)=>a+b.qty,0);
  const total=cart.reduce((a,b)=>a+Number(b.price)*b.qty,0);

  return <div className="app commerce-app">
    <DrillCursor page={page}/>
    <CommerceHeader page={page} setPage={nav} query={query} setQuery={setQuery} cartCount={count} openCart={()=>setCartOpen(true)} favCount={favs.length} compareCount={compare.length} setAdmin={setAdmin}/>
    <main className="commerce-main">
      {page==='home'&&<HomePage products={products} categories={categories} setPage={nav} open={open} add={add} favs={favs} toggleFav={toggleFav} compare={compare} toggleCompare={toggleCompare}/>}
      {page==='catalog'&&<CatalogPage products={products} categories={categories} query={query} setQuery={setQuery} open={open} add={add} favs={favs} toggleFav={toggleFav} compare={compare} toggleCompare={toggleCompare}/>}
      {page==='product'&&selected&&<ProductPage selected={selected} products={products} open={open} add={add} favs={favs} toggleFav={toggleFav} compare={compare} toggleCompare={toggleCompare} setPage={nav}/>}
      {page==='favorites'&&<CollectionPage title="Избранное" items={products.filter(x=>favs.includes(x.id))} open={open} add={add} favs={favs} toggleFav={toggleFav} compare={compare} toggleCompare={toggleCompare} setPage={nav} emptyIcon={<Heart size={42}/>}/>}
      {page==='compare'&&<ComparePage items={products.filter(x=>compare.includes(x.id))} setPage={nav} remove={toggleCompare}/>}
      {page==='checkout'&&<CheckoutPage cart={cart} setCart={setCart} setPage={nav} onSuccess={order=>{setCompletedOrder(order);nav('success')}}/>}
      {page==='success'&&<OrderSuccess order={completedOrder} setPage={nav}/>}
    </main>

    <footer className="commerce-footer">
      <div><img src="/zona-logo.png"/><p>Электроинструменты для дома и профессиональной работы.</p></div>
      <nav><b>Покупателям</b><button onClick={()=>nav('catalog')}>Каталог</button><button>Доставка и оплата</button><button>Возврат</button></nav>
      <nav><b>Компания</b><button>О нас</button><button>Контакты</button><button>Гарантия</button></nav>
      <div className="footer-contact"><b>8 (988) 800-05-05</b><span>Хасавюрт, ул. Тотурбиева 140</span><button onClick={()=>setAdmin(true)}>Админ-панель</button></div>
    </footer>

    <div className={'drawer-bg '+(cartOpen?'show':'')} onClick={()=>setCartOpen(false)}/>
    <aside className={'cart-drawer commerce-cart glass '+(cartOpen?'open':'')}>
      <div className="drawer-head"><div><span className="eyebrow">КОРЗИНА</span><h2>Ваш заказ</h2></div><button className="icon-btn" onClick={()=>setCartOpen(false)}><X/></button></div>
      <div className="cart-list">{cart.length===0?<div className="empty"><ShoppingCart size={38}/><span>Корзина пуста</span></div>:cart.map(i=><div className="cart-item" key={i.id}><img src={productImage(i)}/><span><b>{i.title}</b><small>{rub(i.price)}</small></span><div className="qty"><button onClick={()=>setCart(x=>x.map(v=>v.id===i.id?{...v,qty:Math.max(1,v.qty-1)}:v))}><Minus/></button>{i.qty}<button onClick={()=>setCart(x=>x.map(v=>v.id===i.id?{...v,qty:v.qty+1}:v))}><Plus/></button></div><button className="cart-remove" title="Удалить" onClick={()=>setCart(x=>x.filter(v=>v.id!==i.id))}><Trash2/></button></div>)}</div>
      <div className="drawer-total"><span>Итого</span><b>{rub(total)}</b></div>
      <button className="primary cart-checkout" disabled={!cart.length} onClick={()=>{setCartOpen(false);nav("checkout")}}>Перейти к оформлению</button>
    </aside>

    <nav className="commerce-mobile-nav glass"><button className={page==='home'?'active':''} onClick={()=>nav('home')}><Home/><small>Главная</small></button><button className={page==='catalog'?'active':''} onClick={()=>nav('catalog')}><Grid2X2/><small>Каталог</small></button><button className={page==='favorites'?'active':''} onClick={()=>nav('favorites')}><Heart/><small>Избранное</small></button><button onClick={()=>setCartOpen(true)}><ShoppingCart/><small>Корзина</small>{count>0&&<i>{count}</i>}</button></nav>
  </div>
}

function AdminLogin({onDone,onCancel}){
  const [email,setEmail]=React.useState(''),[password,setPassword]=React.useState(''),[error,setError]=React.useState('');
  const login=async e=>{
    e.preventDefault();
    try{
      const data=await adminLogin(email,password);
      localStorage.setItem('zona_admin_token',data.token);
      onDone();
    }catch(err){setError(err.message)}
  };
  return <div className="admin-login"><form className="glass" onSubmit={login}><img src="/zona-logo.png"/><span className="eyebrow">ADMIN</span><h1>Вход в управление</h1><input type="email" placeholder="Email администратора" value={email} onChange={e=>setEmail(e.target.value)}/><input type="password" placeholder="Пароль" value={password} onChange={e=>setPassword(e.target.value)}/>{error&&<p className="error">{error}</p>}<button className="primary">Войти</button><button type="button" className="ghost" onClick={onCancel}>Вернуться в магазин</button></form></div>
}

function ProductForm({item,categories,onSave,onCancel}){
  const blank={title:'',slug:'',category:categories[0]?.name||'',brand:'ZONA',spec:'',price:0,old_price:0,badge:'',stock:0,description:'',image_url:'',rating:5,reviews:0,is_active:true,is_featured:false,specs:{},images:[],digit_product_id:null,sync_source:'manual',sync_enabled:true,unit:'шт'};
  const [f,setF]=React.useState(item?{...blank,...item}:blank),[uploading,setUploading]=React.useState(false);
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  const file=async e=>{const x=e.target.files?.[0];if(!x)return;setUploading(true);try{const url=await uploadImage(x);set('image_url',url);if(!(f.images||[]).includes(url))set('images',[...(f.images||[]),url])}catch(err){alert(err.message)}finally{setUploading(false)}};
  const multiFiles=async e=>{
    const files=[...(e.target.files||[])]; if(!files.length)return;
    setUploading(true);
    try{
      const urls=[];
      for(const file of files) urls.push(await uploadImage(file));
      setF(x=>({...x,images:[...(x.images||[]),...urls.filter(u=>!(x.images||[]).includes(u))],image_url:x.image_url||urls[0]||''}));
    }catch(err){alert(err.message)}finally{setUploading(false)}
  };
  const removeImage=url=>setF(x=>{const images=(x.images||[]).filter(v=>v!==url);return {...x,images,image_url:x.image_url===url?(images[0]||''):x.image_url}});
  const makeMain=url=>setF(x=>({...x,image_url:url,images:[url,...(x.images||[]).filter(v=>v!==url)]}));
  return <div className="modal-bg"><form className="product-form glass" onSubmit={e=>{e.preventDefault();onSave(f)}}><div className="form-head"><div><span className="eyebrow">{item?'РЕДАКТИРОВАНИЕ':'НОВЫЙ ТОВАР'}</span><h2>{item?'Изменить товар':'Добавить товар'}</h2></div><button type="button" className="icon-btn" onClick={onCancel}><X/></button></div><div className="form-cols"><div><label>Название<input required value={f.title} onChange={e=>set('title',e.target.value)}/></label><label>Slug<input value={f.slug} onChange={e=>set('slug',e.target.value)}/></label><label>Категория<select value={f.category} onChange={e=>set('category',e.target.value)}>{categories.map(c=><option key={c.id||c.name}>{c.name}</option>)}</select></label><label>Характеристики<input value={f.spec} onChange={e=>set('spec',e.target.value)}/></label><label>Описание<textarea value={f.description} onChange={e=>set('description',e.target.value)}/></label>
              <div className="admin-specs-editor">
                <span className="admin-field-title">Характеристики</span>
                {(categorySpecConfig[f.category]||[]).map(cfg=><label key={cfg.key}>{cfg.label}
                  {cfg.type==='boolean'
                    ? <select value={String((f.specs||{})[cfg.key]??'')} onChange={e=>set('specs',{...(f.specs||{}),[cfg.key]:e.target.value===''?'':e.target.value==='true'})}><option value="">Не указано</option><option value="true">Да</option><option value="false">Нет</option></select>
                    : <input value={(f.specs||{})[cfg.key]??''} onChange={e=>set('specs',{...(f.specs||{}),[cfg.key]:cfg.type==='number'&&e.target.value!==''?Number(e.target.value):e.target.value})} placeholder={cfg.unit?`Например: ${cfg.unit}`:'Введите значение'}/>}
                </label>)}
                {!(categorySpecConfig[f.category]||[]).length&&<small>Выберите категорию — появятся подходящие характеристики.</small>}
              </div></div><div><div className="price-fields"><label>Цена<input type="number" value={f.price} onChange={e=>set('price',+e.target.value)}/></label><label>Старая цена<input type="number" value={f.old_price} onChange={e=>set('old_price',+e.target.value)}/></label></div><label>Остаток<input type="number" value={f.stock} onChange={e=>set('stock',+e.target.value)}/></label><label>Бейдж<input value={f.badge} onChange={e=>set('badge',e.target.value)}/></label><label>Фото<input value={f.image_url} onChange={e=>set('image_url',e.target.value)} placeholder="URL или загрузка ниже"/></label><label className="upload-btn"><Upload/> {uploading?'Загрузка...':'Загрузить главное фото'}<input type="file" accept="image/*" onChange={file}/></label>
              <label className="upload-btn multi-upload"><Upload/> {uploading?'Загрузка...':'Добавить несколько фото'}<input type="file" accept="image/*" multiple onChange={multiFiles}/></label>
              <div className="admin-image-gallery">
                {(f.images||[]).map(url=><div className={'admin-image-item '+(f.image_url===url?'main':'')} key={url}>
                  <img src={url}/>
                  <div><button type="button" onClick={()=>makeMain(url)}>Главное</button><button type="button" className="danger" onClick={()=>removeImage(url)}>Удалить</button></div>
                </div>)}
              </div><div className="checks"><label><input type="checkbox" checked={f.is_active} onChange={e=>set('is_active',e.target.checked)}/> Активен</label><label><input type="checkbox" checked={f.is_featured} onChange={e=>set('is_featured',e.target.checked)}/> На главной</label></div><div className="sync-meta-box">
                <div><span>Источник</span><b>{f.sync_source==='digit'?'Digit Учет':'Сайт'}</b></div>
                {f.digit_product_id&&<div><span>ID Digit</span><b>{f.digit_product_id}</b></div>}
                {f.sync_source==='digit'&&<label className="sync-toggle"><input type="checkbox" checked={f.sync_enabled!==false} onChange={e=>set('sync_enabled',e.target.checked)}/> Обновлять из Digit Учет</label>}
              </div></div></div><div className="form-actions"><button type="button" className="ghost" onClick={onCancel}>Отмена</button><button className="primary"><Save/>Сохранить</button></div></form></div>
}

function Admin({onExit}){
  const [tab,setTab]=React.useState('products'),[products,setProducts]=React.useState([]),[categories,setCategories]=React.useState([]),[loading,setLoading]=React.useState(true),[edit,setEdit]=React.useState(null),[form,setForm]=React.useState(false);
  const load=async()=>{setLoading(true);try{setProducts(await getProducts(true));setCategories(await getCategories())}catch(e){alert(e.message)}finally{setLoading(false)}};
  React.useEffect(()=>{load()},[]);
  const save=async data=>{try{if(edit)await editProduct(edit.id,data);else await addProduct(data);setForm(false);setEdit(null);await load()}catch(e){alert(e.message)}};
  const del=async p=>{if(!confirm('Удалить товар «'+p.title+'»?'))return;try{await removeProduct(p.id);await load()}catch(e){alert(e.message)}};
  const logout=()=>{localStorage.removeItem('zona_admin_token');onExit()};
  return <div className="admin-shell"><aside className="admin-side glass"><img src="/zona-logo.png"/><span className="admin-badge">ПАНЕЛЬ УПРАВЛЕНИЯ</span><nav><button className={tab==='dashboard'?'active':''} onClick={()=>setTab('dashboard')}><LayoutDashboard/>Обзор</button><button className={tab==='products'?'active':''} onClick={()=>setTab('products')}><Package/>Товары</button><button className={tab==='orders'?'active':''} onClick={()=>setTab('orders')}><ShoppingBag/>Заказы</button></nav><div className="side-bottom"><span className="online">● Node API + PostgreSQL</span><button onClick={logout}><LogOut/>Выйти</button></div></aside><main className="admin-main"><header><div><span className="eyebrow">ZONA CONTROL</span><h1>{tab==='products'?'Товары':tab==='orders'?'Заказы':'Обзор магазина'}</h1></div>{tab==='products'&&<button className="primary" onClick={()=>{setEdit(null);setForm(true)}}>+ Добавить товар</button>}</header>{tab==='dashboard'&&<div className="stats"><div className="glass"><small>Товаров</small><strong>{products.length}</strong></div><div className="glass"><small>В наличии</small><strong>{products.reduce((a,b)=>a+(b.stock||0),0)}</strong></div><div className="glass"><small>На главной</small><strong>{products.filter(x=>x.is_featured).length}</strong></div></div>}{tab==='products'&&<div className="admin-table glass">{loading?<div className="loading">Загрузка...</div>:products.map(p=><div className="admin-row" key={p.id}><img src={p.image_url||'/tool-drill.svg'}/><div className="admin-name"><b>{p.title}</b><small>{p.category} · {p.spec}</small><em className={'sync-badge '+(p.sync_source==='digit'?'digit':'manual')}>{p.sync_source==='digit'?'DIGIT':'САЙТ'}</em></div><strong>{rub(p.price)}</strong><span>{p.stock} шт.</span><span className={p.is_active?'status on':'status'}>{p.is_active?<><Eye/>Активен</>:<><EyeOff/>Скрыт</>}</span><button onClick={()=>{setEdit(p);setForm(true)}}><Pencil/></button><button className="danger" onClick={()=>del(p)}><Trash2/></button></div>)}</div>}{tab==='orders'&&<div className="empty-admin glass"><ShoppingBag/><h2>Заказы будут здесь</h2><p>В этой версии админка предназначена только для товаров: добавление, редактирование и удаление.</p></div>}</main>{form&&<ProductForm item={edit} categories={categories} onSave={save} onCancel={()=>{setForm(false);setEdit(null)}}/>}</div>
}

function App(){
  const [admin,setAdmin]=React.useState(false),[logged,setLogged]=React.useState(false),[products,setProducts]=React.useState([]),[categories,setCategories]=React.useState([]),[loading,setLoading]=React.useState(true);
  React.useEffect(()=>{(async()=>{try{setProducts(await getProducts(false));setCategories(await getCategories())}catch(e){console.error(e)}finally{setLoading(false)}})()},[]);
  if(admin&&!logged)return <AdminLogin onDone={()=>setLogged(true)} onCancel={()=>setAdmin(false)}/>;
  if(admin&&logged)return <Admin onExit={()=>{setAdmin(false);setLogged(false)}}/>;
  if(loading)return <div className="splash"><img src="/zona-logo.png"/><span>Загрузка магазина...</span></div>;
  return <Store products={products} categories={categories} setAdmin={setAdmin}/>;
}
createRoot(document.getElementById('root')).render(<App/>);