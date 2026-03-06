"use client";

import React, { useState, useRef, useMemo } from "react";
import { Canvas, useThree, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid, Environment } from "@react-three/drei";
import * as THREE from "three";
import { Box as BoxIcon, Trash2, Plus, Grid3X3 } from "lucide-react";

// --- Constants ---
const CELL_SIZE = 4.2; // 42mm scaled down by 10 for better Three.js units (1 unit = 1cm approx)
const GRID_COLS = 10;
const GRID_ROWS = 10;
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

type Mode = "ADD" | "DELETE";

const BOX_SIZES = [
  { label: "1x1", w: 1, h: 1, color: "#4f46e5" }, // Indigo
  { label: "1x2", w: 1, h: 2, color: "#0ea5e9" }, // Sky
  { label: "2x2", w: 2, h: 2, color: "#ec4899" }, // Pink
  { label: "1x4", w: 1, h: 4, color: "#8b5cf6" }, // Violet
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
  onClick,
}: {
  data: { x: number; y: number; w: number; h: number; color?: string };
  isGhost?: boolean;
  isValid?: boolean;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) => {
  // Calculate position: center of the occupied cells
  // x position = (gridX * size) + (width * size / 2) - (drawerWidth / 2)
  // But our grid starts at 0,0 top-left in logic, let's map it to world space
  // World space: 0,0 is center of drawer.
  // Top-Left of drawer is (-width/2, -depth/2)

  const worldX =
    -DRAWER_WIDTH / 2 + data.x * CELL_SIZE + (data.w * CELL_SIZE) / 2;
  const worldZ =
    -DRAWER_DEPTH / 2 + data.y * CELL_SIZE + (data.h * CELL_SIZE) / 2;

  const height = 2; // Fixed height for now

  return (
    <mesh
      position={[worldX, height / 2, worldZ]}
      onClick={onClick}
      castShadow={!isGhost}
      receiveShadow
    >
      <boxGeometry args={[data.w * CELL_SIZE - 0.2, height, data.h * CELL_SIZE - 0.2]} />
      <meshStandardMaterial
        color={isGhost ? (isValid ? "#22c55e" : "#ef4444") : data.color}
        transparent={isGhost}
        opacity={isGhost ? 0.6 : 1}
        roughness={0.3}
      />
      {!isGhost && (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(data.w * CELL_SIZE - 0.2, height, data.h * CELL_SIZE - 0.2)]} />
          <lineBasicMaterial color="white" opacity={0.3} transparent />
        </lineSegments>
      )}
    </mesh>
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
      position={[0, -0.01, 0]} // Slightly below 0 to avoid z-fighting with grid if any
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
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [mode, setMode] = useState<Mode>("ADD");
  const [selectedSize, setSelectedSize] = useState(BOX_SIZES[0]);

  // Calculate validity of current hover position
  const isValidPlacement = useMemo(() => {
    if (!hoverPos) return false;
    const ghostBox = {
      x: hoverPos.x,
      y: hoverPos.y,
      w: selectedSize.w,
      h: selectedSize.h,
    };

    if (
      !isWithinBounds(
        ghostBox.x,
        ghostBox.y,
        ghostBox.w,
        ghostBox.h,
        GRID_COLS,
        GRID_ROWS
      )
    ) {
      return false;
    }

    for (const box of boxes) {
      if (isOverlapping(ghostBox, box)) return false;
    }

    return true;
  }, [hoverPos, boxes, selectedSize]);

  const handlePlaneHover = (point: THREE.Vector3 | null) => {
    if (!point) {
      setHoverPos(null);
      return;
    }

    // Convert world point to grid coordinate
    // World 0,0 is center. Top-left is (-W/2, -D/2)
    const relativeX = point.x + DRAWER_WIDTH / 2;
    const relativeZ = point.z + DRAWER_DEPTH / 2;

    const gridX = Math.floor(relativeX / CELL_SIZE);
    const gridY = Math.floor(relativeZ / CELL_SIZE);

    // Clamp to valid grid coordinates for safety, though bounds check handles logic
    setHoverPos({ x: gridX, y: gridY });
  };

  const handlePlaneClick = () => {
    if (mode === "ADD" && hoverPos && isValidPlacement) {
      const newBox: BoxData = {
        id: Math.random().toString(36).substr(2, 9),
        x: hoverPos.x,
        y: hoverPos.y,
        w: selectedSize.w,
        h: selectedSize.h,
        color: selectedSize.color,
      };
      setBoxes([...boxes, newBox]);
    }
  };

  const handleBoxClick = (e: ThreeEvent<MouseEvent>, boxId: string) => {
    e.stopPropagation();
    if (mode === "DELETE") {
      setBoxes(boxes.filter((b) => b.id !== boxId));
    }
  };
  
  // Calculate stats
  const filledUnits = boxes.reduce((acc, box) => acc + (box.w * box.h), 0);
  const totalUnits = GRID_COLS * GRID_ROWS;

  return (
    <div className="w-full h-screen bg-gray-900 flex flex-col">
      {/* --- UI Layer --- */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-4">
        {/* Mode Selector */}
        <div className="bg-white/90 backdrop-blur p-2 rounded-xl shadow-lg flex flex-col gap-2">
           <h2 className="text-xs font-bold uppercase text-gray-500 px-2 pt-1">Tools</h2>
           <div className="flex gap-2">
            <button
                onClick={() => setMode("ADD")}
                className={`p-3 rounded-lg flex items-center gap-2 transition-all ${
                mode === "ADD"
                    ? "bg-blue-600 text-white shadow-md"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
            >
                <Plus size={20} />
                <span className="font-medium">Add</span>
            </button>
            <button
                onClick={() => setMode("DELETE")}
                className={`p-3 rounded-lg flex items-center gap-2 transition-all ${
                mode === "DELETE"
                    ? "bg-red-500 text-white shadow-md"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
            >
                <Trash2 size={20} />
                <span className="font-medium">Delete</span>
            </button>
           </div>
        </div>

        {/* Size Selector (Only visible in ADD mode) */}
        {mode === "ADD" && (
          <div className="bg-white/90 backdrop-blur p-2 rounded-xl shadow-lg flex flex-col gap-2">
            <h2 className="text-xs font-bold uppercase text-gray-500 px-2 pt-1">Sizes</h2>
            <div className="grid grid-cols-2 gap-2">
              {BOX_SIZES.map((size) => (
                <button
                  key={size.label}
                  onClick={() => setSelectedSize(size)}
                  className={`p-3 rounded-lg flex flex-col items-center justify-center border-2 transition-all ${
                    selectedSize.label === size.label
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <Grid3X3 size={16} className="mb-1 opacity-50" />
                  <span className="text-sm font-bold">{size.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Bottom Stats Bar */}
       <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
         <div className="bg-white/90 backdrop-blur px-6 py-3 rounded-full shadow-xl flex items-center gap-6">
            <div className="flex flex-col items-center">
                <span className="text-xs font-bold text-gray-400 uppercase">Usage</span>
                <span className="text-xl font-black text-gray-800">{filledUnits} / {totalUnits}</span>
            </div>
            <div className="h-8 w-px bg-gray-200"></div>
            <div className="flex flex-col items-center">
                 <span className="text-xs font-bold text-gray-400 uppercase">Boxes</span>
                 <span className="text-xl font-black text-gray-800">{boxes.length}</span>
            </div>
         </div>
       </div>


      {/* --- 3D Scene --- */}
      <div className="flex-1">
        <Canvas shadows camera={{ position: [15, 20, 15], fov: 45 }}>
          <Environment preset="city" />
          <ambientLight intensity={0.5} />
          <directionalLight
            position={[10, 20, 10]}
            intensity={1}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />

          <group position={[0, 0, 0]}>
            {/* Drawer Base & Grid */}
            <DrawerPlane onHover={handlePlaneHover} onClick={handlePlaneClick} />
            <Grid
              position={[0, 0.01, 0]}
              args={[DRAWER_WIDTH, DRAWER_DEPTH]}
              cellSize={CELL_SIZE}
              cellThickness={1}
              cellColor="#9ca3af"
              sectionSize={CELL_SIZE * 5}
              sectionThickness={1.5}
              sectionColor="#6b7280"
              fadeDistance={100}
              infiniteGrid={false}
            />
            
            {/* Drawer Borders (Visual Only) */}
             <mesh position={[0, 1, -DRAWER_DEPTH/2 - 0.5]} receiveShadow>
                <boxGeometry args={[DRAWER_WIDTH + 2, 2, 1]} />
                <meshStandardMaterial color="#374151" />
             </mesh>
             <mesh position={[0, 1, DRAWER_DEPTH/2 + 0.5]} receiveShadow>
                <boxGeometry args={[DRAWER_WIDTH + 2, 2, 1]} />
                <meshStandardMaterial color="#374151" />
             </mesh>
             <mesh position={[-DRAWER_WIDTH/2 - 0.5, 1, 0]} receiveShadow>
                <boxGeometry args={[1, 2, DRAWER_DEPTH]} />
                <meshStandardMaterial color="#374151" />
             </mesh>
             <mesh position={[DRAWER_WIDTH/2 + 0.5, 1, 0]} receiveShadow>
                <boxGeometry args={[1, 2, DRAWER_DEPTH]} />
                <meshStandardMaterial color="#374151" />
             </mesh>

            {/* Placed Boxes */}
            {boxes.map((box) => (
              <BoxMesh
                key={box.id}
                data={box}
                onClick={(e) => handleBoxClick(e, box.id)}
              />
            ))}

            {/* Ghost Box */}
            {mode === "ADD" && hoverPos && (
              <BoxMesh
                data={{
                    x: hoverPos.x,
                    y: hoverPos.y,
                    w: selectedSize.w,
                    h: selectedSize.h,
                    id: "ghost"
                }}
                isGhost
                isValid={isValidPlacement}
              />
            )}
          </group>

          <OrbitControls
            makeDefault
            minPolarAngle={0}
            maxPolarAngle={Math.PI / 2.2} // Prevent going below ground
            maxDistance={50}
            minDistance={10}
          />
        </Canvas>
      </div>
    </div>
  );
}
