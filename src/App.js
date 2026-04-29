import React, { useState, useRef, useEffect } from 'react';
import { supabase } from './supabaseClient';
import SignatureCanvas from 'react-signature-canvas';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { User, Clock, Check, FileText, Trash2, PenTool, Users } from 'lucide-react';
import './App.css';

function App() {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', in: '', out: '' });
  const [todaysEntries, setTodaysEntries] = useState([]);
  const sigCanvas = useRef({});

  // Fetch entries for the current day
  const fetchTodaysEntries = async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('public_timesheets')
      .select('full_name, clock_in_time, clock_out_time')
      .eq('work_date', today)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setTodaysEntries(data);
    }
  };

  useEffect(() => {
    fetchTodaysEntries();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (sigCanvas.current.isEmpty()) return alert("Please sign to verify your times.");
    
    setLoading(true);

    try {
      const canvas = sigCanvas.current.getCanvas();
      const signatureImage = canvas.toDataURL('image/png');
      const response = await fetch(signatureImage);
      const blob = await response.blob();
      
      const cleanName = formData.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const fileName = `signatures/${Date.now()}-${cleanName}.png`;

      const { error: storageError } = await supabase.storage
        .from('signatures')
        .upload(fileName, blob);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase.from('public_timesheets').insert([{
        full_name: formData.name,
        clock_in_time: formData.in,
        clock_out_time: formData.out,
        signature_url: fileName,
        is_signed: true
      }]);

      if (dbError) throw dbError;

      alert(`Success! Entry saved for ${formData.name}`);
      setFormData({ name: '', in: '', out: '' });
      sigCanvas.current.clear();
      
      // Refresh the sidebar list
      fetchTodaysEntries();

    } catch (err) {
      console.error("Submission error:", err);
      alert("Submission failed. Check console.");
    } finally {
      setLoading(false);
    }
  };

  const exportMonthlyPDF = async () => {
    const { data, error } = await supabase
      .from('public_timesheets')
      .select('*')
      .order('work_date', { ascending: false });

    if (error || !data || data.length === 0) return alert("No records found.");

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Work Attendance Logs", 14, 20);
    
    const rows = data.map(d => [
      d.work_date,
      d.full_name,
      d.clock_in_time,
      d.clock_out_time
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['Date', 'Full Name', 'In', 'Out']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [99, 102, 241] }
    });

    doc.save(`Attendance_Report.pdf`);
  };

  return (
    <div className="layout-container">
      {/* Left Side: The Form */}
      <div className="glass-card main-form fade-in">
        <header>
          <h1>Daily Sign-In</h1>
          <p>Please enter your details below</p>
        </header>

        <form onSubmit={handleSubmit} className="kiosk-form">
          <div className="input-group">
            <label><User size={14}/> Full Name</label>
            <input 
              type="text" 
              placeholder="Your name"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              required 
            />
          </div>

          <div className="row">
            <div className="input-group">
              <label><Clock size={14}/> Time In</label>
              <input 
                type="time" 
                value={formData.in}
                onChange={(e) => setFormData({...formData, in: e.target.value})}
                required 
              />
            </div>
            <div className="input-group">
              <label><Clock size={14}/> Time Out</label>
              <input 
                type="time" 
                value={formData.out}
                onChange={(e) => setFormData({...formData, out: e.target.value})}
                required 
              />
            </div>
          </div>

          <div className="sig-area">
            <label><PenTool size={14}/> Signature</label>
            <div className="canvas-box">
              <SignatureCanvas 
                ref={sigCanvas} 
                penColor="#1e1b4b" 
                canvasProps={{width: 320, height: 120, className: 'sigCanvas'}} 
              />
            </div>
            <button type="button" className="btn-ghost" onClick={() => sigCanvas.current.clear()}>
              <Trash2 size={12}/> Clear Canvas
            </button>
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Saving...' : 'Submit Entry'} <Check size={18}/>
          </button>
        </form>

        <div className="divider"></div>

        <button onClick={exportMonthlyPDF} className="btn-secondary">
          <FileText size={18} /> Export Full History (PDF)
        </button>
      </div>

      {/* Right Side: The Daily List */}
      <div className="glass-card sidebar fade-in">
        <header className="sidebar-header">
          <div className="date-pill">
            {new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
          </div>
          <h3>Today's Activity</h3>
        </header>

        <div className="entry-list">
          {todaysEntries.length > 0 ? (
            todaysEntries.map((entry, idx) => (
              <div key={idx} className="entry-item">
                <div className="entry-info">
                  <span className="entry-name">{entry.full_name}</span>
                  <span className="entry-times">{entry.clock_in_time} - {entry.clock_out_time}</span>
                </div>
                <div className="check-icon"><Check size={12} color="white"/></div>
              </div>
            ))
          ) : (
            <p className="empty-msg">No entries yet today.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;