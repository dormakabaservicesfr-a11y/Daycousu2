
import React, { useState, useEffect, useCallback } from 'react';
import { MONTHS, EVENT_TYPES, MONTH_THEMES } from './constants.tsx';
import { EventType, EventData } from './types.ts';
import { generateEventIdeas, suggestLocation } from './services/geminiService.ts';
import EventBubble from './components/EventBubble.tsx';
import RegistrationModal from './components/RegistrationModal.tsx';

// On déclare Gun globalement (chargé via script tag dans index.html)
declare var Gun: any;

const App: React.FC = () => {
  const [events, setEvents] = useState<EventData[]>([]);
  const [inputName, setInputName] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedType, setSelectedType] = useState<EventType | ''>('');
  const [loading, setLoading] = useState(false);
  const [activeEvent, setActiveEvent] = useState<EventData | null>(null);
  const [gun, setGun] = useState<any>(null);

  // Initialisation de Gun.js pour la synchro temps réel
  useEffect(() => {
    // Utilisation de relais publics pour la synchronisation partagée
    const gunInstance = Gun([
      'https://gun-manhattan.herokuapp.com/gun',
      'https://relay.peer.ooo/gun'
    ]);
    const eventsNode = gunInstance.get('day_app_shared_db_v1');
    setGun(eventsNode);

    // Écouter les changements en temps réel
    eventsNode.map().on((data: any, id: string) => {
      setEvents(currentEvents => {
        if (!data) {
          // Si data est null, l'événement a été supprimé
          return currentEvents.filter(e => e.id !== id);
        }
        
        // On s'assure que les données sont valides
        const eventData = { ...data, id };
        const exists = currentEvents.find(e => e.id === id);
        
        if (exists) {
          // Mise à jour de l'existant (uniquement si changement réel pour éviter boucles)
          if (JSON.stringify(exists) === JSON.stringify(eventData)) return currentEvents;
          return currentEvents.map(e => e.id === id ? eventData : e);
        } else {
          // Ajout du nouvel événement
          return [...currentEvents, eventData];
        }
      });
    });

    return () => {
      eventsNode.off();
    };
  }, []);

  const handleAddEvent = async () => {
    console.log("Tentative de création d'événement...", { selectedMonth, selectedType, inputName });
    if (!selectedMonth || !selectedType || !gun) {
      console.warn("Champs manquants ou base de données non prête");
      return;
    }

    setLoading(true);
    try {
      const usedIcons = events.map(e => e.icon);
      
      console.log("Appel Gemini pour les idées...");
      const idea = await generateEventIdeas(selectedMonth, selectedType, inputName, usedIcons);
      console.log("Idée reçue:", idea);
      
      const finalTitle = inputName.trim() || idea.title;
      
      // Tentative de suggestion de lieu (on n'attend pas forcément le succès pour créer)
      let location = { name: "Lieu à définir" };
      try {
        const suggested = await suggestLocation(finalTitle, selectedMonth);
        if (suggested) location = suggested;
      } catch (locErr) {
        console.warn("Erreur suggestion lieu, utilisation défaut:", locErr);
      }

      const id = Math.random().toString(36).substr(2, 9);
      const newEvent: EventData = {
        id,
        title: finalTitle,
        date: idea.date,
        description: idea.description,
        icon: idea.icon, 
        type: selectedType,
        month: selectedMonth,
        attendees: [],
        maxParticipants: idea.maxParticipants || 4,
        location: location
      };

      // Sauvegarde dans Gun.js (partage instantané)
      console.log("Sauvegarde dans la DB partagée...");
      gun.get(id).put(newEvent);
      
      setInputName('');
      console.log("Événement créé avec succès !");
      
      setTimeout(() => {
        const monthElement = document.getElementById(`month-${selectedMonth}`);
        monthElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);

    } catch (err: any) {
      console.error("Erreur critique lors de handleAddEvent:", err);
      alert(`Erreur: ${err.message || "Problème de connexion"}. Veuillez vérifier la console.`);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = (name: string) => {
    if (activeEvent && gun) {
      const updatedAttendees = [...(activeEvent.attendees || []), name];
      gun.get(activeEvent.id).get('attendees').put(updatedAttendees);
    }
  };

  const handleUnregister = (index: number) => {
    if (activeEvent && gun) {
      const newAttendees = [...(activeEvent.attendees || [])];
      newAttendees.splice(index, 1);
      gun.get(activeEvent.id).get('attendees').put(newAttendees);
    }
  };

  const handleDeleteEvent = (id: string) => {
    if (gun) {
      gun.get(id).put(null); // Gun.js : mettre à null pour supprimer
    }
  };

  const handleUpdateField = (id: string, field: keyof EventData, value: any) => {
    if (gun) {
      gun.get(id).get(field).put(value);
    }
  };

  const handleUpdateLocation = (locationName: string) => {
    if (activeEvent && gun) {
      const updatedLocation = {
        name: locationName,
        mapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationName)}`
      };
      gun.get(activeEvent.id).get('location').put(updatedLocation);
    }
  };

  return (
    <div className="min-h-screen px-4 py-12 md:py-20 flex flex-col items-center max-w-[1700px] mx-auto overflow-x-hidden">
      {/* Badge de Synchronisation */}
      <div className="fixed top-6 right-6 z-[60] flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md rounded-full shadow-lg border border-emerald-100">
        <div className="w-2 h-2 rounded-full bg-emerald-500 sync-indicator"></div>
        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Base partagée</span>
      </div>

      <header className="w-full text-center mb-24 relative">
        <div className="absolute -top-20 left-1/4 w-72 h-72 bg-emerald-300/20 rounded-full blur-[100px] -z-10 animate-pulse"></div>
        <div className="absolute -top-10 right-1/4 w-72 h-72 bg-indigo-300/20 rounded-full blur-[100px] -z-10 animate-pulse" style={{ animationDelay: '1s' }}></div>
        
        <h1 className="text-6xl font-black text-slate-900 mb-4 tracking-tighter">
          Day <span className="bg-clip-text text-transparent bg-gradient-to-br from-emerald-400 via-teal-500 to-lime-500 inline-block drop-shadow-sm">🧵</span>
        </h1>
        <p className="text-slate-400 mb-12 font-bold tracking-[0.2em] uppercase text-[10px]">
          Planifiez vos moments d'exception ensemble
        </p>

        <div className="relative group max-w-5xl mx-auto">
          <div className="absolute -inset-1 bg-gradient-to-r from-emerald-400 via-teal-500 to-lime-500 rounded-[3rem] blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
          
          <div className="relative glass p-6 md:p-10 rounded-[2.8rem] shadow-2xl shadow-indigo-200/50 w-full flex flex-col lg:flex-row gap-8 items-end bg-white/90 border border-white/80">
            <div className="flex-[2] w-full space-y-3 text-left">
              <label className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] ml-2 flex items-center gap-2">
                Nom de l'événement
              </label>
              <input 
                type="text"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                placeholder="Ex: Anniversaire surprise..."
                className="w-full bg-slate-50/50 border border-slate-200/60 rounded-2xl px-6 py-4.5 focus:ring-4 focus:ring-emerald-100/50 focus:border-emerald-400 outline-none transition-all text-slate-700 font-bold placeholder:text-slate-300 shadow-inner"
              />
            </div>

            <div className="flex-1 w-full space-y-3 text-left">
              <label className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] ml-2">Mois</label>
              <div className="relative">
                <select 
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full bg-slate-50/50 border border-slate-200/60 rounded-2xl px-6 py-4.5 focus:ring-4 focus:ring-emerald-100/50 focus:border-emerald-400 outline-none transition-all cursor-pointer text-slate-700 font-bold appearance-none shadow-inner"
                >
                  <option value="">Choisir...</option>
                  {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            <div className="flex-1 w-full space-y-3 text-left">
              <label className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] ml-2">Type</label>
              <div className="relative">
                <select 
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as EventType)}
                  className="w-full bg-slate-50/50 border border-slate-200/60 rounded-2xl px-6 py-4.5 focus:ring-4 focus:ring-emerald-100/50 focus:border-emerald-400 outline-none transition-all cursor-pointer text-slate-700 font-bold appearance-none shadow-inner"
                >
                  <option value="">Choisir...</option>
                  {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <button 
              onClick={handleAddEvent}
              disabled={loading || !selectedMonth || !selectedType}
              className={`
                w-full lg:w-auto px-12 py-4.5 rounded-2xl font-black text-white shadow-xl transition-all flex items-center justify-center gap-3 active:scale-95 group/btn overflow-hidden relative
                ${loading || !selectedMonth || !selectedType 
                  ? 'bg-slate-200 cursor-not-allowed text-slate-400' 
                  : 'bg-gradient-to-br from-emerald-500 via-teal-600 to-lime-500 hover:shadow-emerald-200/50'}
              `}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <span className="relative z-10">CRÉER</span>
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
              className={`
                group relative flex flex-col min-h-[400px] p-8 rounded-[3.5rem] border transition-all duration-500 
                hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.08)] hover:-translate-y-1
                ${theme.bg} ${theme.border}
              `}
            >
              <div className={`absolute top-8 right-8 text-8xl font-black opacity-[0.03] select-none group-hover:opacity-[0.07] transition-opacity duration-500 ${theme.text}`}>
                {(index + 1).toString().padStart(2, '0')}
              </div>
              
              <div className="relative mb-8 flex items-center justify-between">
                <h2 className={`text-2xl font-black tracking-tight flex items-center gap-3 ${theme.text}`}>
                  <span className={`w-2 h-8 rounded-full shadow-sm ${theme.accent}`}></span>
                  {month}
                </h2>
              </div>
              
              <div className="flex-1 flex flex-wrap content-start justify-center gap-6 relative z-10">
                {monthEvents.length > 0 ? (
                  monthEvents.map(event => (
                    <EventBubble 
                      key={event.id} 
                      event={event} 
                      canEdit={true}
                      onClick={() => setActiveEvent(event)} 
                      onDelete={() => handleDeleteEvent(event.id)}
                    />
                  ))
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center space-y-3 py-10">
                    <p className={`text-[9px] font-black uppercase tracking-[0.3em] text-center max-w-[120px] opacity-30 ${theme.text}`}>Libre</p>
                  </div>
                )}
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
          onUpdateMaxParticipants={(val) => {
            handleUpdateField(activeEvent.id, 'maxParticipants', val);
            // On met à jour l'event local pour refléter instantanément dans la modale
            setActiveEvent(prev => prev ? { ...prev, maxParticipants: val } : null);
          }}
        />
      )}
    </div>
  );
};

export default App;
