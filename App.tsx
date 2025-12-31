
import React, { useState, useEffect, useCallback } from 'react';
import { MONTHS, EVENT_TYPES, MONTH_THEMES } from './constants.tsx';
import { EventType, EventData } from './types.ts';
import { generateEventIdeas, suggestLocation } from './services/geminiService.ts';
import EventBubble from './components/EventBubble.tsx';
import RegistrationModal from './components/RegistrationModal.tsx';

declare var Gun: any;

const App: React.FC = () => {
  const [events, setEvents] = useState<EventData[]>([]);
  const [inputName, setInputName] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedType, setSelectedType] = useState<EventType | ''>('');
  const [loading, setLoading] = useState(false);
  const [activeEvent, setActiveEvent] = useState<EventData | null>(null);
  const [gunNode, setGunNode] = useState<any>(null);

  useEffect(() => {
    // Initialisation avec plusieurs relais pour plus de stabilité
    const gun = Gun([
      'https://gun-manhattan.herokuapp.com/gun',
      'https://relay.peer.ooo/gun',
      'https://gun-us.herokuapp.com/gun'
    ]);
    const node = gun.get('day_app_shared_db_final_v1');
    setGunNode(node);

    node.map().on((data: any, id: string) => {
      setEvents(current => {
        if (!data) return current.filter(e => e.id !== id);
        
        // On traite les données reçues de Gun (certains champs sont stringifiés pour Gun)
        try {
          const formattedEvent: EventData = {
            ...data,
            id,
            attendees: typeof data.attendees === 'string' ? JSON.parse(data.attendees) : (data.attendees || []),
            location: typeof data.location === 'string' ? JSON.parse(data.location) : (data.location || { name: "Lieu à définir" })
          };

          const exists = current.find(e => e.id === id);
          if (exists && JSON.stringify(exists) === JSON.stringify(formattedEvent)) return current;
          
          if (exists) {
            return current.map(e => e.id === id ? formattedEvent : e);
          } else {
            return [...current, formattedEvent];
          }
        } catch (e) {
          console.error("Erreur de formatage Gun:", e);
          return current;
        }
      });
    });

    return () => node.off();
  }, []);

  const handleAddEvent = async () => {
    if (!selectedMonth || !selectedType || !gunNode) return;

    setLoading(true);
    try {
      const usedIcons = events.map(e => e.icon);
      
      // On tente de générer avec l'IA, mais on récupère toujours un résultat (IA ou Fallback)
      const idea = await generateEventIdeas(selectedMonth, selectedType, inputName, usedIcons);
      
      const finalTitle = inputName.trim() || idea.title;
      const location = await suggestLocation(finalTitle, selectedMonth);

      const id = Math.random().toString(36).substr(2, 9);
      
      // On prépare l'objet pour Gun (on stringifie les objets/tableaux complexes pour éviter les bugs Gun)
      const newEventData = {
        title: finalTitle,
        date: idea.date,
        description: idea.description,
        icon: idea.icon, 
        type: selectedType,
        month: selectedMonth,
        attendees: JSON.stringify([]),
        maxParticipants: idea.maxParticipants || 4,
        location: JSON.stringify(location || { name: "Lieu à définir" })
      };

      gunNode.get(id).put(newEventData);
      
      setInputName('');
      setSelectedType('');
      
      setTimeout(() => {
        const monthElement = document.getElementById(`month-${selectedMonth}`);
        monthElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);

    } catch (err: any) {
      console.error("Erreur fatale handleAddEvent:", err);
      alert("Une erreur imprévue est survenue. Vérifiez la console.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = (name: string) => {
    if (activeEvent && gunNode) {
      const updatedAttendees = [...(activeEvent.attendees || []), name];
      gunNode.get(activeEvent.id).get('attendees').put(JSON.stringify(updatedAttendees));
      // Update locale immédiate pour UX
      setActiveEvent({ ...activeEvent, attendees: updatedAttendees });
    }
  };

  const handleUnregister = (index: number) => {
    if (activeEvent && gunNode) {
      const newAttendees = [...(activeEvent.attendees || [])];
      newAttendees.splice(index, 1);
      gunNode.get(activeEvent.id).get('attendees').put(JSON.stringify(newAttendees));
      setActiveEvent({ ...activeEvent, attendees: newAttendees });
    }
  };

  const handleDeleteEvent = (id: string) => {
    if (gunNode) gunNode.get(id).put(null);
  };

  const handleUpdateField = (id: string, field: keyof EventData, value: any) => {
    if (gunNode) {
      const val = (field === 'attendees' || field === 'location') ? JSON.stringify(value) : value;
      gunNode.get(id).get(field).put(val);
    }
  };

  const handleUpdateLocation = (locationName: string) => {
    if (activeEvent && gunNode) {
      const updatedLocation = {
        name: locationName,
        mapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationName)}`
      };
      gunNode.get(activeEvent.id).get('location').put(JSON.stringify(updatedLocation));
      setActiveEvent({ ...activeEvent, location: updatedLocation });
    }
  };

  return (
    <div className="min-h-screen px-4 py-12 md:py-20 flex flex-col items-center max-w-[1700px] mx-auto overflow-x-hidden">
      <div className="fixed top-6 right-6 z-[60] flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-md rounded-full shadow-lg border border-emerald-100">
        <div className="w-2 h-2 rounded-full bg-emerald-500 sync-indicator"></div>
        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Base Partagée</span>
      </div>

      <header className="w-full text-center mb-24 relative">
        <div className="absolute -top-20 left-1/4 w-72 h-72 bg-emerald-300/20 rounded-full blur-[100px] -z-10 animate-pulse"></div>
        <div className="absolute -top-10 right-1/4 w-72 h-72 bg-indigo-300/20 rounded-full blur-[100px] -z-10 animate-pulse" style={{ animationDelay: '1s' }}></div>
        
        <h1 className="text-6xl font-black text-slate-900 mb-4 tracking-tighter">
          Day <span className="bg-clip-text text-transparent bg-gradient-to-br from-emerald-400 via-teal-500 to-lime-500 inline-block drop-shadow-sm">🧵</span>
        </h1>
        <p className="text-slate-400 mb-12 font-bold tracking-[0.2em] uppercase text-[10px]">
          Organisez vos moments à plusieurs, en temps réel
        </p>

        <div className="relative group max-w-5xl mx-auto">
          <div className="absolute -inset-1 bg-gradient-to-r from-emerald-400 via-teal-500 to-lime-500 rounded-[3rem] blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
          
          <div className="relative glass p-6 md:p-10 rounded-[2.8rem] shadow-2xl shadow-indigo-200/50 w-full flex flex-col lg:flex-row gap-8 items-end bg-white/95 border border-white/80">
            <div className="flex-[2] w-full space-y-3 text-left">
              <label className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] ml-2">Nom (Optionnel)</label>
              <input 
                type="text"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                placeholder="Ex: Anniversaire surprise..."
                className="w-full bg-slate-50/50 border border-slate-200/60 rounded-2xl px-6 py-4.5 focus:ring-4 focus:ring-emerald-100/50 focus:border-emerald-400 outline-none transition-all text-slate-700 font-bold placeholder:text-slate-300"
              />
            </div>

            <div className="flex-1 w-full space-y-3 text-left">
              <label className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] ml-2">Mois</label>
              <select 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full bg-slate-50/50 border border-slate-200/60 rounded-2xl px-6 py-4.5 focus:ring-4 focus:ring-emerald-100/50 focus:border-emerald-400 outline-none text-slate-700 font-bold appearance-none cursor-pointer"
              >
                <option value="">Choisir...</option>
                {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div className="flex-1 w-full space-y-3 text-left">
              <label className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] ml-2">Type</label>
              <select 
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as EventType)}
                className="w-full bg-slate-50/50 border border-slate-200/60 rounded-2xl px-6 py-4.5 focus:ring-4 focus:ring-emerald-100/50 focus:border-emerald-400 outline-none text-slate-700 font-bold appearance-none cursor-pointer"
              >
                <option value="">Choisir...</option>
                {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <button 
              onClick={handleAddEvent}
              disabled={loading || !selectedMonth || !selectedType}
              className={`
                w-full lg:w-auto px-12 py-4.5 rounded-2xl font-black text-white shadow-xl transition-all flex items-center justify-center gap-3 active:scale-95
                ${loading || !selectedMonth || !selectedType 
                  ? 'bg-slate-200 cursor-not-allowed text-slate-400' 
                  : 'bg-gradient-to-br from-emerald-500 to-teal-600 hover:shadow-emerald-200/50'}
              `}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <span>CRÉER</span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8 mb-20">
        {MONTHS.map((month, index) => {
          const monthEvents = events.filter(e => e.month === month);
          const theme = MONTH_THEMES[month];
          return (
            <section 
              key={month} 
              id={`month-${month}`}
              className={`group relative flex flex-col min-h-[400px] p-8 rounded-[3.5rem] border transition-all duration-500 ${theme.bg} ${theme.border}`}
            >
              <div className={`absolute top-8 right-8 text-8xl font-black opacity-[0.03] select-none ${theme.text}`}>
                {(index + 1).toString().padStart(2, '0')}
              </div>
              
              <h2 className={`text-2xl font-black tracking-tight flex items-center gap-3 mb-8 ${theme.text}`}>
                <span className={`w-2 h-8 rounded-full ${theme.accent}`}></span>
                {month}
              </h2>
              
              <div className="flex-1 flex flex-wrap content-start justify-center gap-6 relative z-10">
                {monthEvents.map(event => (
                  <EventBubble 
                    key={event.id} 
                    event={event} 
                    canEdit={true}
                    onClick={() => setActiveEvent(event)} 
                    onDelete={() => handleDeleteEvent(event.id)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </main>

      {activeEvent && (
        <RegistrationModal 
          event={activeEvent} 
          canEdit={true}
          onClose={() => setActiveEvent(null)} 
          onRegister={handleRegister} 
          onUnregister={handleUnregister}
          onUpdateLocation={handleUpdateLocation}
          onUpdateDate={(val) => handleUpdateField(activeEvent.id, 'date', val)}
          onUpdateDescription={(val) => handleUpdateField(activeEvent.id, 'description', val)}
          onUpdateMaxParticipants={(val) => handleUpdateField(activeEvent.id, 'maxParticipants', val)}
        />
      )}
    </div>
  );
};

export default App;
