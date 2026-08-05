import React, { useState, useEffect } from 'react';
import * as d3 from 'd3';
import RadialClimateChart from './components/RadialClimateChart';
import './App.css';

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch CSV from the public folder
    d3.csv('/abu-dhabi.csv', (d) => ({
      year: +d.year,
      annual_temp: +d.annual_temp,
      annual_hi: +d.annual_hi,
      annual_prep: +d.annual_prep,
    })).then((parsedData) => {
      // Filter for 2000 to 2020
      const filteredData = parsedData.filter(d => d.year >= 2000 && d.year <= 2020);
      setData(filteredData);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="container">
      <h1 style={{ textAlign: 'center' }}>Abu Dhabi Climate Data</h1>
      <RadialClimateChart data={data} width={800} height={800} />
    </div>
  );
}