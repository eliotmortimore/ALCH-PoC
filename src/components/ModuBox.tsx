"use client";

import React, { useState, useMemo } from "react";
import { Canvas, useThree, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid, Environment, Html } from "@react-three/drei";
import * as THREE from "three";
import { Box as BoxIcon, Trash2, Copy, Grid3X3, RotateCw, Hand } from "lucide-react";
import { useDrag } from "@use-gesture/react";

// --- Constants ---
const CELL_SIZE = 4.2;
const GRID_COLS = 8;
const GRID_ROWS = 7;
const DRAWER_WIDTH = GRID_COLS * CELL_SIZE;
const DRAWER_DEPTH = GRID_ROWS * CELL_SIZE;

// --- Types ---
type BoxData = {
  id: string;
  x: number; // Grid coordinate (0-9)
  y: number; // Grid coordinate (0-9)
  w: number; // Width in grid units
  h: number; // Depth in grid units
  color: string;
};

const BOX_SIZES = [
  { label: "1x1", w: 1, h: 1, color: "#FF8A80" }, // Salmon
  { label: "1x2", w: 1, h: 2, color: "#FFFF8D" }, // Lemon
  { label: "2x2", w: 2, h: 2, color: "#80D8FF" }, // Sky
  { label: "1x4", w: 1, h: 4, color: "#B9F6CA" }, // Mint
  { label: "2x4", w: 2, h: 4, color: "#FFD180" }, // Orange
];

// --- Helper Functions ---
const isOverlapping = (
  b1: { x: number; y: number; w: number; h: number },
  b2: { x: number; y: number; w: number; h: number }
) => {
  return (
    b1.x < b2.x + b2.w &&
    b1.x + b1.w > b2.x &&
    b1.y < b2.y + b2.h &&
    b1.y + b1.h > b2.y
  );
};

const isWithinBounds = (
  x: number,
  y: number,
  w: number,
  h: number,
  cols: number,
  rows: number
) => {
  return x >= 0 && y >= 0 && x + w <= cols && y + h <= rows;
};

// --- Components ---

const BoxMesh = ({
  data,
  isGhost = false,
  isValid = true,
  isSelected = false,
  onClick,
  onDragStart,
  onDragEnd,
  onDrag,
}: {
  data: { x: number; y: number; w: number; h: number; color?: string };
  isGhost?: boolean;
  isValid?: boolean;
  isSelected?: boolean;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDrag?: (x: number, y: number) => void;
}) => {
  const worldX = -DRAWER_WIDTH / 2 + data.x * CELL_SIZE + (data.w * CELL_SIZE) / 2;
  const worldZ = -DRAWER_DEPTH / 2 + data.y * CELL_SIZE + (data.h * CELL_SIZE) / 2;
  const height = 3; // Taller for container look
  const wallThickness = 0.2;
  const floorThickness = 0.2;
  const width = data.w * CELL_SIZE - 0.2;
  const depth = data.h * CELL_SIZE - 0.2;

  // Drag logic
  const { camera, raycaster, size, gl } = useThree();

  const bind = useDrag(
    ({ active, xy: [x, y], event, memo, tap }) => {
      if (isGhost) return;
      if (tap && onClick) {
         onClick(event as any);
         return;
      }
      
      if (active) {
          // Raycast from mouse position to infinite plane y=0
          // Convert screen coordinates (x, y) to normalized device coordinates (-1 to +1)
          const rect = gl.domElement.getBoundingClientRect();
          const nx = ((x - rect.left) / rect.width) * 2 - 1;
          const ny = -((y - rect.top) / rect.height) * 2 + 1;
          
          raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
          
          const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
          const target = new THREE.Vector3();
          raycaster.ray.intersectPlane(plane, target);
          
          if (!target) return memo;

          if (!memo) {
               if (onDragStart) onDragStart();
               // Calculate offset from the box's current center to the click point on the plane
               // Current Box Center in World Space:
               const currentWorldX = -DRAWER_WIDTH / 2 + data.x * CELL_SIZE + (data.w * CELL_SIZE) / 2;
               const currentWorldZ = -DRAWER_DEPTH / 2 + data.y * CELL_SIZE + (data.h * CELL_SIZE) / 2;
               
               return {
                   offsetX: currentWorldX - target.x,
                   offsetZ: currentWorldZ - target.z
               };
          }
          
          // Apply offset to maintain relative grab position
          const newWorldX = target.x + memo.offsetX;
          const newWorldZ = target.z + memo.offsetZ;
          
          // Convert World Pos back to Grid Index (Top-Left based)
          // formula: worldX = -W/2 + x*C + (w*C)/2
          // solve for x:
          const rawGridX = (newWorldX + DRAWER_WIDTH / 2 - (data.w * CELL_SIZE) / 2) / CELL_SIZE;
          const rawGridY = (newWorldZ + DRAWER_DEPTH / 2 - (data.h * CELL_SIZE) / 2) / CELL_SIZE;
          
          if (onDrag) onDrag(Math.round(rawGridX), Math.round(rawGridY));
          
          return memo;
      } else {
          if (onDragEnd) onDragEnd();
      }
    },
    { filterTaps: true }
  );

  // Materials
  const materialProps = {
    color: isGhost ? (isValid ? "#22c55e" : "#ef4444") : data.color,
    transparent: isGhost,
    opacity: isGhost ? 0.6 : 1,
    emissive: isSelected ? "#ffffff" : "#000000",
    emissiveIntensity: isSelected ? 0.2 : 0,
    toneMapped: false, // Key for flat toon look
  };

  const lineMaterial = new THREE.LineBasicMaterial({ color: "black", transparent: isGhost, opacity: isGhost ? 0.3 : 1 });

  return (
    <group position={[worldX, 0, worldZ]} {...(isGhost ? {} : bind()) as any}>
      {/* --- Container Geometry Group --- */}
      
      {/* Floor */}
      <mesh 
        position={[0, floorThickness / 2, 0]} 
        castShadow 
        receiveShadow
        raycast={isGhost ? () => null : undefined} // Ignore rays if ghost
      >
        <boxGeometry args={[width, floorThickness, depth]} />
        <meshToonMaterial {...materialProps} />
      </mesh>
      
      {/* Wall: Front (+Z) */}
      <mesh 
        position={[0, height / 2, depth / 2 - wallThickness / 2]} 
        castShadow 
        receiveShadow
        raycast={isGhost ? () => null : undefined}
      >
        <boxGeometry args={[width, height, wallThickness]} />
        <meshToonMaterial {...materialProps} />
      </mesh>

      {/* Wall: Back (-Z) */}
      <mesh 
        position={[0, height / 2, -depth / 2 + wallThickness / 2]} 
        castShadow 
        receiveShadow
        raycast={isGhost ? () => null : undefined}
      >
        <boxGeometry args={[width, height, wallThickness]} />
        <meshToonMaterial {...materialProps} />
      </mesh>

      {/* Wall: Right (+X) */}
      <mesh 
        position={[width / 2 - wallThickness / 2, height / 2, 0]} 
        castShadow 
        receiveShadow
        raycast={isGhost ? () => null : undefined}
      >
        <boxGeometry args={[wallThickness, height, depth - wallThickness * 2]} />
        <meshToonMaterial {...materialProps} />
      </mesh>

      {/* Wall: Left (-X) */}
      <mesh 
        position={[-width / 2 + wallThickness / 2, height / 2, 0]} 
        castShadow 
        receiveShadow
        raycast={isGhost ? () => null : undefined}
      >
        <boxGeometry args={[wallThickness, height, depth - wallThickness * 2]} />
        <meshToonMaterial {...materialProps} />
      </mesh>

      {/* --- Outlines (Edges) --- */}
      {!isGhost && (
        <>
            {/* Outline logic: Simplified bounding box outline for performance/aesthetic */}
             <lineSegments position={[0, height/2, 0]}>
                <edgesGeometry args={[new THREE.BoxGeometry(width, height, depth)]} />
                <primitive object={lineMaterial} />
            </lineSegments>
             {/* Inner floor outline */}
             <lineSegments position={[0, floorThickness + 0.01, 0]} rotation={[-Math.PI/2,0,0]}>
                <edgesGeometry args={[new THREE.PlaneGeometry(width - wallThickness*2, depth - wallThickness*2)]} />
                <primitive object={lineMaterial} />
            </lineSegments>
        </>
      )}
    </group>
  );
};

const TransformGizmo = ({
  box,
  onMove,
}: {
  box: BoxData;
  onMove: (dx: number, dy: number) => void; // Delta in grid units
}) => {
  const { camera, gl } = useThree();
  const worldX = -DRAWER_WIDTH / 2 + box.x * CELL_SIZE + (box.w * CELL_SIZE) / 2;
  const worldZ = -DRAWER_DEPTH / 2 + box.y * CELL_SIZE + (box.h * CELL_SIZE) / 2;
  const height = 4; // Above the box (height 3)

  // Drag logic for arrows
  const bindX = useDrag(
    ({ movement: [mx], memo = 0, event }) => {
      event.stopPropagation();
      const delta = mx / 20; // Sensitivity factor
      if (Math.abs(delta - memo) >= 1) { // 1 unit threshold (approx)
         // Calculate snapped delta
         const steps = Math.floor(delta) - Math.floor(memo);
         if(steps !== 0) onMove(steps, 0);
         return memo + steps;
      }
      return memo;
    },
    { pointer: { keys: false } }
  );

  const bindZ = useDrag(
    ({ movement: [_, my], memo = 0, event }) => {
      event.stopPropagation();
       // In 3D space, dragging up/down on screen maps to Z axis depending on camera angle
       // Simple approximation for this PoC
       const delta = my / 20; 
       if (Math.abs(delta - memo) >= 1) {
         const steps = Math.floor(delta) - Math.floor(memo);
         if(steps !== 0) onMove(0, steps);
         return memo + steps;
       }
       return memo;
    },
    { pointer: { keys: false } }
  );
  
  // Custom simple click handlers for move arrows (easier for PoC than full drag math)
  // Clicking arrow moves 1 unit
  const handleArrowClick = (e: ThreeEvent<MouseEvent>, dx: number, dy: number) => {
      e.stopPropagation();
      onMove(dx, dy);
  }


  return (
    <group position={[worldX, height, worldZ]}>
      {/* -- Arrows (Visuals) -- */}
      {/* X Axis (Red) */}
      <group position={[box.w * CELL_SIZE * 0.6, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
         <mesh onClick={(e) => handleArrowClick(e, 1, 0)}>
            <coneGeometry args={[0.5, 1.5, 16]} />
            <meshBasicMaterial color="#ef4444" depthTest={false} transparent opacity={0.9} />
         </mesh>
         <mesh position={[0, -0.75, 0]} onClick={(e) => handleArrowClick(e, 1, 0)}>
             <cylinderGeometry args={[0.15, 0.15, 1.5]} />
             <meshBasicMaterial color="#ef4444" depthTest={false} transparent opacity={0.9} />
         </mesh>
      </group>
       <group position={[-box.w * CELL_SIZE * 0.6, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
         <mesh onClick={(e) => handleArrowClick(e, -1, 0)}>
            <coneGeometry args={[0.5, 1.5, 16]} />
            <meshBasicMaterial color="#ef4444" depthTest={false} transparent opacity={0.9} />
         </mesh>
         <mesh position={[0, -0.75, 0]} onClick={(e) => handleArrowClick(e, -1, 0)}>
             <cylinderGeometry args={[0.15, 0.15, 1.5]} />
             <meshBasicMaterial color="#ef4444" depthTest={false} transparent opacity={0.9} />
         </mesh>
      </group>

      {/* Z Axis (Blue) */}
      <group position={[0, 0, box.h * CELL_SIZE * 0.6]} rotation={[Math.PI / 2, 0, 0]}>
         <mesh onClick={(e) => handleArrowClick(e, 0, 1)}>
            <coneGeometry args={[0.5, 1.5, 16]} />
            <meshBasicMaterial color="#3b82f6" depthTest={false} transparent opacity={0.9} />
         </mesh>
         <mesh position={[0, -0.75, 0]} onClick={(e) => handleArrowClick(e, 0, 1)}>
             <cylinderGeometry args={[0.15, 0.15, 1.5]} />
             <meshBasicMaterial color="#3b82f6" depthTest={false} transparent opacity={0.9} />
         </mesh>
      </group>
      <group position={[0, 0, -box.h * CELL_SIZE * 0.6]} rotation={[-Math.PI / 2, 0, 0]}>
         <mesh onClick={(e) => handleArrowClick(e, 0, -1)}>
            <coneGeometry args={[0.5, 1.5, 16]} />
            <meshBasicMaterial color="#3b82f6" depthTest={false} transparent opacity={0.9} />
         </mesh>
         <mesh position={[0, -0.75, 0]} onClick={(e) => handleArrowClick(e, 0, -1)}>
             <cylinderGeometry args={[0.15, 0.15, 1.5]} />
             <meshBasicMaterial color="#3b82f6" depthTest={false} transparent opacity={0.9} />
         </mesh>
      </group>
    </group>
  );
};

const DrawerPlane = ({
  onHover,
  onClick,
}: {
  onHover: (point: THREE.Vector3 | null) => void;
  onClick: () => void;
}) => {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.01, 0]} 
      receiveShadow
      onPointerMove={(e) => {
        e.stopPropagation();
        onHover(e.point);
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <planeGeometry args={[DRAWER_WIDTH, DRAWER_DEPTH]} />
      <meshStandardMaterial color="#e5e7eb" />
    </mesh>
  );
};

// --- Main Component ---

export default function ModuBox() {
  const [boxes, setBoxes] = useState<BoxData[]>([]);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  
  // Interaction States
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [draggedTemplate, setDraggedTemplate] = useState<{ w: number; h: number; color: string; label: string } | null>(null);
  const [isDraggingBox, setIsDraggingBox] = useState(false);

  // --- Logic ---

  const handlePlaneHover = (point: THREE.Vector3 | null) => {
    if (!point) {
      setHoverPos(null);
      return;
    }
    const relativeX = point.x + DRAWER_WIDTH / 2;
    const relativeZ = point.z + DRAWER_DEPTH / 2;
    const gridX = Math.floor(relativeX / CELL_SIZE);
    const gridY = Math.floor(relativeZ / CELL_SIZE);
    setHoverPos({ x: gridX, y: gridY });
  };

  const handlePlaneClick = () => {
    // If dragging a new template, place it
    if (draggedTemplate && hoverPos) {
       const isValid = checkPlacement(hoverPos.x, hoverPos.y, draggedTemplate.w, draggedTemplate.h);
       if (isValid) {
         const newBox: BoxData = {
           id: Math.random().toString(36).substr(2, 9),
           x: hoverPos.x,
           y: hoverPos.y,
           w: draggedTemplate.w,
           h: draggedTemplate.h,
           color: draggedTemplate.color,
         };
         setBoxes([...boxes, newBox]);
         // Only stop dragging if NOT a copy operation (standard library drag is single-use)
         if (draggedTemplate.label !== "Copy") {
            setDraggedTemplate(null);
         }
       }
    } else {
        // Deselect if clicking empty space
        setSelectedBoxId(null);
    }
  };

  const checkPlacement = (x: number, y: number, w: number, h: number, ignoreId?: string) => {
     if (!isWithinBounds(x, y, w, h, GRID_COLS, GRID_ROWS)) return false;
     const testBox = { x, y, w, h };
     for (const box of boxes) {
        if (box.id === ignoreId) continue;
        if (isOverlapping(testBox, box)) return false;
     }
     return true;
  }

  // --- Transform Actions ---

  const handleMoveBox = (id: string, dx: number, dy: number) => {
     const box = boxes.find(b => b.id === id);
     if(!box) return;

     const newX = box.x + dx;
     const newY = box.y + dy;

     if(checkPlacement(newX, newY, box.w, box.h, id)) {
         setBoxes(boxes.map(b => b.id === id ? { ...b, x: newX, y: newY } : b));
     }
  };

  const handleRotateBox = (id: string) => {
     const box = boxes.find(b => b.id === id);
     if(!box) return;
     
     // Rotate 90deg (swap w/h)
     const newW = box.h;
     const newH = box.w;
     
     // Simple center pivot logic or top-left pivot? 
     // Let's try to keep center roughly same, but aligned to grid
     // Actually for simplicity in this grid system, pivoting around top-left (current x,y) is safest 
     // unless we implement the complex "pivot around clicked cell" logic again. 
     // Let's stick to simple in-place rotation (top-left anchor) and verify bounds.
     
     if(checkPlacement(box.x, box.y, newW, newH, id)) {
         setBoxes(boxes.map(b => b.id === id ? { ...b, w: newW, h: newH } : b));
     }
  };
  
  const handleDeleteBox = (id: string) => {
      setBoxes(boxes.filter(b => b.id !== id));
      setSelectedBoxId(null);
  };

  const handleDuplicateBox = (id: string) => {
     const box = boxes.find(b => b.id === id);
     if(!box) return;
     // Enter "Drag Template" mode with this box's props
     setDraggedTemplate({ w: box.w, h: box.h, color: box.color, label: "Copy" });
     setSelectedBoxId(null);
  }

  // --- Render ---

  // Ghost for drag-and-drop
  const ghostValid = useMemo(() => {
     if(!draggedTemplate || !hoverPos) return false;
     return checkPlacement(hoverPos.x, hoverPos.y, draggedTemplate.w, draggedTemplate.h);
  }, [draggedTemplate, hoverPos, boxes]);


  return (
    <div className="w-full h-screen bg-gray-900 flex">
        
      {/* --- Left Library Panel --- */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col z-10 shadow-sm">
         <div className="p-4 border-b border-gray-100">
             <h1 className="text-gray-900 font-bold text-lg flex items-center gap-2">
                 <BoxIcon className="text-black" />
                 ModuBOX
             </h1>
             <p className="text-gray-400 text-xs mt-1 font-mono">PROTOTYPE v0.2</p>
         </div>
         
         <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
             {BOX_SIZES.map((size) => (
                 <button
                    key={size.label}
                    onClick={() => setDraggedTemplate(size)}
                    className={`flex items-center gap-4 p-3 rounded-xl border transition-all hover:scale-105 active:scale-95 text-left group
                        ${draggedTemplate?.label === size.label 
                            ? "border-black bg-gray-50 ring-1 ring-black/5" 
                            : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"}`}
                 >
                    <div 
                        className="w-10 h-10 rounded-md border border-black/10 flex items-center justify-center font-mono text-xs font-bold text-black/50"
                        style={{ backgroundColor: size.color }}
                    >
                        {size.w}x{size.h}
                    </div>
                    <div>
                        <div className="text-gray-900 font-bold text-sm">{size.label}</div>
                        <div className="text-gray-400 text-[10px] uppercase tracking-wide">Container</div>
                    </div>
                 </button>
             ))}
         </div>

         {draggedTemplate && (
             <div className="p-4 bg-gray-50 border-t border-gray-200">
                 <div className="text-gray-500 text-xs font-bold uppercase mb-2 flex items-center gap-2">
                     <Hand size={14} />
                     {draggedTemplate.label === "Copy" ? "Copying..." : "Placing..."}
                 </div>
             </div>
         )}
      </div>

      {/* --- 3D Scene --- */}
      <div className="flex-1 relative bg-white">
        {/* Stats Overlay */}
        <div className="absolute bottom-6 right-6 z-10 pointer-events-none">
             <div className="bg-white/80 backdrop-blur text-black border border-black/10 px-4 py-2 rounded-lg text-xs font-mono font-bold">
                {boxes.reduce((acc, b) => acc + (b.w * b.h), 0)} / {GRID_COLS * GRID_ROWS} UNITS FILLED
             </div>
        </div>

        {/* Context Toolbar */}
        {(selectedBoxId || draggedTemplate) && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20">
                <div className="bg-white/90 backdrop-blur shadow-2xl rounded-full px-6 py-2 flex items-center gap-4 border border-white/50">
                     
                     {/* --- SELECTION MODE --- */}
                     {selectedBoxId && (
                        <>
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider border-r border-gray-300 pr-4 mr-1">
                                Selected
                            </span>
                            
                            <button 
                                onClick={() => handleRotateBox(selectedBoxId)}
                                className="p-2 text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-full transition-colors tooltip-trigger relative group"
                                title="Rotate 90°"
                            >
                                <RotateCw size={20} />
                                <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                    Rotate
                                </span>
                            </button>

                            <button 
                                onClick={() => handleDuplicateBox(selectedBoxId)}
                                className="p-2 text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-full transition-colors group relative"
                                title="Duplicate"
                            >
                                <Copy size={20} />
                                <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                    Duplicate
                                </span>
                            </button>

                            <div className="w-px h-6 bg-gray-200 mx-1"></div>

                            <button 
                                onClick={() => handleDeleteBox(selectedBoxId)}
                                className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors group relative"
                                title="Delete"
                            >
                                <Trash2 size={20} />
                                <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                    Delete
                                </span>
                            </button>
                        </>
                     )}

                     {/* --- PLACEMENT / COPY MODE --- */}
                     {draggedTemplate && !selectedBoxId && (
                        <>
                            <span className="text-xs font-bold text-blue-500 uppercase tracking-wider border-r border-gray-300 pr-4 mr-1 flex items-center gap-2">
                                <Hand size={14} />
                                {draggedTemplate.label === "Copy" ? "Copy Mode" : "Placing Item"}
                            </span>
                            
                            <button 
                                onClick={() => setDraggedTemplate(null)}
                                className="px-4 py-1 bg-gray-800 text-white text-xs font-bold rounded-full hover:bg-black transition-colors"
                            >
                                {draggedTemplate.label === "Copy" ? "Stop Copying" : "Cancel"}
                            </button>
                        </>
                     )}

                </div>
            </div>
        )}

        <Canvas shadows camera={{ position: [10, 15, 10], fov: 35 }} gl={{ toneMapping: THREE.NoToneMapping }}>
          <ambientLight intensity={0.6} />
          <directionalLight
            position={[10, 20, 5]}
            intensity={1.5}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0001}
          />

          <group position={[0, 0, 0]}>
            <DrawerPlane onHover={handlePlaneHover} onClick={handlePlaneClick} />
            <Grid
              position={[0, 0.01, 0]}
              args={[DRAWER_WIDTH, DRAWER_DEPTH]}
              cellSize={CELL_SIZE}
              cellThickness={0.5}
              cellColor="#d1d5db" // Light gray grid
              sectionSize={CELL_SIZE * 4}
              sectionThickness={1}
              sectionColor="#9ca3af"
              fadeDistance={60}
              infiniteGrid={false}
            />
            
            {/* Drawer Borders - Simplified for clean look */}
             <mesh position={[0, 1.5, -DRAWER_DEPTH/2 - 0.2]} receiveShadow>
                <boxGeometry args={[DRAWER_WIDTH, 3, 0.4]} />
                <meshToonMaterial color="#e5e7eb" />
                <lineSegments>
                    <edgesGeometry args={[new THREE.BoxGeometry(DRAWER_WIDTH, 3, 0.4)]} />
                    <lineBasicMaterial color="black" transparent opacity={0.1} />
                </lineSegments>
             </mesh>
             <mesh position={[0, 1.5, DRAWER_DEPTH/2 + 0.2]} receiveShadow>
                <boxGeometry args={[DRAWER_WIDTH, 3, 0.4]} />
                <meshToonMaterial color="#e5e7eb" />
                <lineSegments>
                    <edgesGeometry args={[new THREE.BoxGeometry(DRAWER_WIDTH, 3, 0.4)]} />
                    <lineBasicMaterial color="black" transparent opacity={0.1} />
                </lineSegments>
             </mesh>
             <mesh position={[-DRAWER_WIDTH/2 - 0.2, 1.5, 0]} receiveShadow>
                <boxGeometry args={[0.4, 3, DRAWER_DEPTH + 0.8]} />
                <meshToonMaterial color="#e5e7eb" />
                <lineSegments>
                    <edgesGeometry args={[new THREE.BoxGeometry(0.4, 3, DRAWER_DEPTH + 0.8)]} />
                    <lineBasicMaterial color="black" transparent opacity={0.1} />
                </lineSegments>
             </mesh>
             <mesh position={[DRAWER_WIDTH/2 + 0.2, 1.5, 0]} receiveShadow>
                <boxGeometry args={[0.4, 3, DRAWER_DEPTH + 0.8]} />
                <meshToonMaterial color="#e5e7eb" />
                 <lineSegments>
                    <edgesGeometry args={[new THREE.BoxGeometry(0.4, 3, DRAWER_DEPTH + 0.8)]} />
                    <lineBasicMaterial color="black" transparent opacity={0.1} />
                </lineSegments>
             </mesh>

            {/* Placed Boxes */}
            {boxes.map((box) => (
              <React.Fragment key={box.id}>
                   <BoxMesh
                     data={box}
                     isSelected={selectedBoxId === box.id}
                     onClick={(e) => {
                         // Selection handled inside BoxMesh via tap
                         if(!draggedTemplate && !isDraggingBox) setSelectedBoxId(box.id);
                     }}
                     onDragStart={() => {
                         setIsDraggingBox(true);
                         setSelectedBoxId(box.id); // Auto-select on drag
                     }}
                     onDragEnd={() => setIsDraggingBox(false)}
                     onDrag={(nx, ny) => {
                         // Direct update for responsiveness
                         if(checkPlacement(nx, ny, box.w, box.h, box.id)) {
                             setBoxes(prev => prev.map(b => b.id === box.id ? {...b, x: nx, y: ny} : b));
                         }
                     }}
                   />
                  {selectedBoxId === box.id && (
                      <TransformGizmo 
                        box={box} 
                        onMove={(dx, dy) => handleMoveBox(box.id, dx, dy)}
                      />
                  )}
              </React.Fragment>
            ))}

            {/* Ghost Template */}
            {draggedTemplate && hoverPos && (
              <BoxMesh
                data={{
                    x: hoverPos.x,
                    y: hoverPos.y,
                    w: draggedTemplate.w,
                    h: draggedTemplate.h,
                    color: draggedTemplate.color,
                }}
                isGhost
                isValid={ghostValid}
              />
            )}
          </group>

          <OrbitControls
            makeDefault
            minPolarAngle={0}
            maxPolarAngle={Math.PI / 2.2}
            maxDistance={50}
            minDistance={10}
            enabled={!isDraggingBox} // Disable OrbitControls when dragging box
          />
        </Canvas>
      </div>
    </div>
  );
}
