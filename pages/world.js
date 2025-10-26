import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment";
import { loadBoy, updateBoy, playBoy } from "../components/boy.js";
import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";

const SOLANA_RPC_URL = "https://api.devnet.solana.com";
const SUBSCRIPTION_PROGRAM_ID = "8vB5vwjvaqi3ZTRnzzQcw8MifMhbE4EJgnKfGfFNkH44";
const SUBSCRIPTION_AMOUNT = 0.001; // SOL

// Subscription Program IDL
const SUBSCRIPTION_IDL = {
  version: "0.1.0",
  name: "subscription_program",
  instructions: [
    {
      name: "subscribe",
      accounts: [
        { name: "subscription", isMut: true, isSigner: false },
        { name: "user", isMut: true, isSigner: true },
        { name: "vault", isMut: true, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false }
      ],
      args: []
    }
  ],
  accounts: [
    {
      name: "Subscription",
      type: {
        kind: "struct",
        fields: [{ name: "user", type: "publicKey" }]
      }
    }
  ]
};

export default function HomePage() {
  const containerRef = useRef(null);
  const router = useRouter();
  const [walletAddress, setWalletAddress] = useState(null);
  const [showSubscribePrompt, setShowSubscribePrompt] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [expiresAt, setExpiresAt] = useState(null);
  const [daysRemaining, setDaysRemaining] = useState(0);
  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState("");

  // Connect Phantom wallet
  const connectWallet = async () => {
    try {
      const { solana } = window;
      if (!solana?.isPhantom) {
        alert("Please install Phantom wallet!");
        window.open("https://phantom.app/", "_blank");
        return;
      }
      const response = await solana.connect();
      setWalletAddress(response.publicKey.toString());
      checkSubscription(response.publicKey);
    } catch (error) {
      console.error("Error connecting wallet:", error);
      setSubError("Failed to connect wallet");
    }
  };

  // Check if user has subscribed
  const checkSubscription = async (publicKey) => {
    try {
      const connection = new Connection(SOLANA_RPC_URL, "confirmed");
      const programId = new PublicKey(SUBSCRIPTION_PROGRAM_ID);
      
      // Derive subscription PDA (v2 for new structure)
      const [subscriptionPda] = await PublicKey.findProgramAddress(
        [Buffer.from("subscription_v2"), publicKey.toBuffer()],
        programId
      );

      // Check if subscription account exists and read data
      const accountInfo = await connection.getAccountInfo(subscriptionPda);
      
      if (accountInfo && accountInfo.data.length >= 48) {
        // Parse subscription data: user (32 bytes) + expires_at (8 bytes)
        const expiresAtBytes = accountInfo.data.slice(40, 48);
        const expiresAtTimestamp = Number(
          new DataView(expiresAtBytes.buffer, expiresAtBytes.byteOffset).getBigInt64(0, true)
        );
        
        const now = Math.floor(Date.now() / 1000);
        const isActive = expiresAtTimestamp > now;
        const daysLeft = Math.max(0, Math.ceil((expiresAtTimestamp - now) / (24 * 60 * 60)));
        
        setExpiresAt(expiresAtTimestamp);
        setDaysRemaining(daysLeft);
        setIsSubscribed(isActive);
        setShowSubscribePrompt(!isActive);
      } else {
        setIsSubscribed(false);
        setExpiresAt(null);
        setDaysRemaining(0);
        setShowSubscribePrompt(true);
      }
    } catch (error) {
      console.error("Error checking subscription:", error);
      setIsSubscribed(false);
      setExpiresAt(null);
      setDaysRemaining(0);
      setShowSubscribePrompt(true);
    }
  };

  // Auto-connect wallet on load
  useEffect(() => {
    const { solana } = window;
    if (solana?.isPhantom && solana.isConnected) {
      solana.connect({ onlyIfTrusted: true })
        .then((response) => {
          setWalletAddress(response.publicKey.toString());
          checkSubscription(response.publicKey);
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    const containerElement = containerRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9; // slightly brighter overall
    renderer.shadowMap.enabled = true;
    containerElement.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // Replace solid color with a simple gradient sky dome
    scene.background = null;
    scene.fog = null;
    const skyGeo = new THREE.SphereGeometry(500, 32, 32);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x87ceeb) }, // sky blue
        bottomColor: { value: new THREE.Color(0xf0f8ff) }, // alice blue
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main(){
          vec4 p = modelMatrix * vec4(position, 1.0);
          vWorldPosition = p.xyz;
          gl_Position = projectionMatrix * viewMatrix * p;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPosition;
        void main(){
          float h = normalize(vWorldPosition).y * 0.5 + 0.5;
          vec3 col = mix(bottomColor, topColor, pow(h, 1.5));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    scene.add(skyMesh);

    // Mountains removed as requested

    // Clouds removed as requested
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(2.5, 2, 3);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(
      new RoomEnvironment(renderer),
      0.04
    ).texture;

    // Improved lighting for Japanese garden atmosphere
    const sun = new THREE.DirectionalLight(0xfff8dc, 1.2); // warm sunlight
    sun.position.set(3, 5, 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.1;
    sun.shadow.camera.far = 50;
    sun.shadow.camera.left = -10;
    sun.shadow.camera.right = 10;
    sun.shadow.camera.top = 10;
    sun.shadow.camera.bottom = -10;
    scene.add(sun);

    // Soft ambient light with slight pink tint for cherry blossom atmosphere
    scene.add(new THREE.AmbientLight(0xfff0f5, 0.4));

    // Add a subtle fill light
    const fillLight = new THREE.DirectionalLight(0xe6e6fa, 0.3);
    fillLight.position.set(-2, 3, -1);
    scene.add(fillLight);

    // Position the sun low in the sky, similar to planets in the diagram
    const SUN_ELEVATION_DEG = 8; // low near the horizon
    const SUN_AZIMUTH_DEG = 330; // moved further to the left, facing the island
    const sunDir = new THREE.Vector3();
    const phi = THREE.MathUtils.degToRad(90 - SUN_ELEVATION_DEG);
    const theta = THREE.MathUtils.degToRad(SUN_AZIMUTH_DEG);
    sunDir.setFromSphericalCoords(1, phi, theta);
    // Place the light along that direction; closer and leftward
    sun.position.copy(sunDir.clone().multiplyScalar(20));
    sun.intensity = 1.25;

    // No mountains or other background geometry

    const loader = new GLTFLoader();
    let sunModel = null;
    // Load a large visible sun model high in the sky
    loader.load("/assets/sun.glb", (sgltf) => {
      sunModel = sgltf.scene;
      // Keep original GLB materials; don't override colors/emissive/toneMapping
      sunModel.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = false;
          o.receiveShadow = false;
        }
      });
      // Position along the sun direction; smaller, lower, and nearer
      const sunDistance = 18;
      const pos = sunDir.clone().multiplyScalar(sunDistance);
      // Keep very low so it's clearly to the side of the island
      pos.y = Math.max(pos.y, 1.5);
      sunModel.position.copy(pos);
      sunModel.scale.setScalar(3.0);
      // Look toward the world origin until island center is known
      sunModel.lookAt(new THREE.Vector3(0, 0, 0));
      scene.add(sunModel);
    });
    let islandRoot = null;
    const islandMeshes = [];

    // House doorway trigger state
    let houseRef = null;
    let enteredDoor = false;
    let doorTriggerLocal = null;
    const SHOW_DOOR_TRIGGER_DEBUG = false;
    let doorDebug = null;
    let goalIsHouse = false;

    let boy = null;
    let isWalking = false;
    let wasWalking = false; // track animation state transitions
    const targetPos = new THREE.Vector3();
    const WALK_SPEED = 0.5;
    const ARRIVE_RADIUS = 0.05; // tolerance to consider arrival

    // Helpers
    function frameObject(obj, { pad = 0.35 } = {}) {  // Reduced pad from 0.4 to 0.15 for closer view
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3()).length();
      const center = box.getCenter(new THREE.Vector3());

      controls.target.copy(center);
      const fitDist = (size * pad) / Math.tan((Math.PI * camera.fov) / 360);

      // Position camera closer and at a better angle for the island view
      const offsetVector = new THREE.Vector3(fitDist * 1.2, fitDist * 1.1, fitDist * 0.4);  // Raised Y from 1.1 to 1.4 for higher angle
      // Rotate the offset vector 25 degrees to the right around Y axis
      offsetVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(40));
      camera.position
        .copy(center)
        .add(offsetVector);
      // Raise camera vertically by additional amount
      camera.position.y += 1.0;
      camera.near = size / 100;
      camera.far = size * 100;
      camera.updateProjectionMatrix();
      controls.update();
    }

    function placeOnIsland(
      object3D,
      x,
      z,
      { sinkDepth = 0.03, alignToSlope = true } = {}
    ) {
      if (!islandMeshes.length) return;
      const rayOrigin = new THREE.Vector3(x, 50, z);
      const raycaster = new THREE.Raycaster(
        rayOrigin,
        new THREE.Vector3(0, -1, 0)
      );
      const hits = raycaster.intersectObjects(islandMeshes, true);
      if (!hits.length) {
        object3D.position.set(x, 0, z);
        return;
      }

      const hit = hits[0];
      const n =
        hit.face && hit.face.normal
          ? hit.face.normal.clone().normalize()
          : new THREE.Vector3(0, 1, 0);
      const pos = hit.point.clone().addScaledVector(n, -sinkDepth);
      object3D.position.copy(pos);

      if (alignToSlope) {
        const up = new THREE.Vector3(0, 1, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(up, n);
        const blended = new THREE.Quaternion().slerpQuaternions(
          new THREE.Quaternion(),
          q,
          0.5
        );
        object3D.quaternion.premultiply(blended);
      }
    }

    function groundHitAt(x, z, meshes) {
      const rc = new THREE.Raycaster(
        new THREE.Vector3(x, 50, z),
        new THREE.Vector3(0, -1, 0)
      );
      const hits = rc.intersectObjects(meshes, true);
      for (const h of hits) {
        const n = (h.object.name || "").toLowerCase();
        const m = (h.object.material?.name || "").toLowerCase();
        if (!/water|pond|lake|pool/.test(n) && !/water|pond|lake|pool/.test(m))
          return h;
      }
      return null;
    }

    function boundsXZ(root) {
      const b = new THREE.Box3().setFromObject(root);
      return { minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z };
    }

    function dropHighestAt(x, z) {
      const rc = new THREE.Raycaster(
        new THREE.Vector3(x, 50, z),
        new THREE.Vector3(0, -1, 0)
      );
      const hits = rc.intersectObjects(islandMeshes, true);
      if (!hits.length) return null;
      const candidates = hits.filter((h) => {
        const n = (h.object.name || "").toLowerCase();
        const m = (h.object.material?.name || "").toLowerCase();
        return (
          !/water|pond|lake|pool/.test(n) && !/water|pond|lake|pool/.test(m)
        );
      });
      if (!candidates.length) return null;
      candidates.sort((a, b) => b.point.y - a.point.y);
      return candidates[0];
    }

    function computeLocalAABB(obj) {
      const worldBB = new THREE.Box3().setFromObject(obj);
      const corners = [
        new THREE.Vector3(worldBB.min.x, worldBB.min.y, worldBB.min.z),
        new THREE.Vector3(worldBB.min.x, worldBB.min.y, worldBB.max.z),
        new THREE.Vector3(worldBB.min.x, worldBB.max.y, worldBB.min.z),
        new THREE.Vector3(worldBB.min.x, worldBB.max.y, worldBB.max.z),
        new THREE.Vector3(worldBB.max.x, worldBB.min.y, worldBB.min.z),
        new THREE.Vector3(worldBB.max.x, worldBB.min.y, worldBB.max.z),
        new THREE.Vector3(worldBB.max.x, worldBB.max.y, worldBB.min.z),
        new THREE.Vector3(worldBB.max.x, worldBB.max.y, worldBB.max.z),
      ];
      const localBB = new THREE.Box3();
      for (const c of corners) {
        const lc = obj.worldToLocal(c.clone());
        localBB.expandByPoint(lc);
      }
      return localBB;
    }

    function computeDoorTriggerLocal(obj) {
      // Entire house bounds, with slight padding on all axes
      const bb = computeLocalAABB(obj);
      const w = bb.max.x - bb.min.x;
      const h = bb.max.y - bb.min.y;
      const d = bb.max.z - bb.min.z;
      const padFrac = 0.06; // 6% padding around house
      const px = w * padFrac;
      const py = h * padFrac * 0.5; // smaller Y pad to avoid ground
      const pz = d * padFrac;
      const min = new THREE.Vector3(bb.min.x - px, bb.min.y - py, bb.min.z - pz);
      const max = new THREE.Vector3(bb.max.x + px, bb.max.y + py, bb.max.z + pz);
      return { min, max };
    }

    function computeHouseApproachPoint() {
      if (!houseRef || !doorTriggerLocal) return null;
      // Aim for a point slightly in front of the door center (outside the house)
      const centerLocal = new THREE.Vector3(
        (doorTriggerLocal.min.x + doorTriggerLocal.max.x) * 0.5,
        (doorTriggerLocal.min.y + doorTriggerLocal.max.y) * 0.5,
        doorTriggerLocal.min.z
      );
      const margin = 0.35; // step out in front of the door
      const outsideLocal = centerLocal.clone();
      outsideLocal.z -= margin; // assuming door on -Z side
      const outsideWorld = houseRef.localToWorld(outsideLocal.clone());
      const hit = groundHitAt(outsideWorld.x, outsideWorld.z, islandMeshes);
      return hit ? hit.point.clone() : outsideWorld;
    }

    // Place by island-bounds fractions (decoupled from camera and other props)
    function placeOnIslandByFrac(
      object3D,
      fracX,
      fracZ,
      { pad = 0.18, alignToSlope = true } = {}
    ) {
      if (!islandRoot) return;
      const box = new THREE.Box3().setFromObject(islandRoot);
      const x = THREE.MathUtils.lerp(
        box.min.x + pad,
        box.max.x - pad,
        THREE.MathUtils.clamp(fracX, 0, 1)
      );
      const z = THREE.MathUtils.lerp(
        box.min.z + pad,
        box.max.z - pad,
        THREE.MathUtils.clamp(fracZ, 0, 1)
      );
      const hit = dropHighestAt(x, z);
      if (hit) {
        const up = new THREE.Vector3(0, 1, 0);
        const n =
          hit.face && hit.face.normal
            ? hit.face.normal.clone().normalize()
            : up.clone();
        object3D.position.copy(hit.point);
        if (alignToSlope) {
          const q = new THREE.Quaternion().setFromUnitVectors(up, n);
          object3D.quaternion.copy(q);
        }
      } else {
        object3D.position.set(x, 0, z);
      }
    }

    const rand = (a, b) => a + Math.random() * (b - a);

    // Load island and props
    loader.load("/assets/island.glb", (gltf) => {
      islandRoot = gltf.scene;
      islandRoot.scale.set(2.0, 2.0, 3.0);

      islandRoot.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          islandMeshes.push(o);
        }
      });

      scene.add(islandRoot);
      frameObject(islandRoot);

      // Aim the directional light and sun model at the island center
      const islandCenter = new THREE.Box3()
        .setFromObject(islandRoot)
        .getCenter(new THREE.Vector3());
      sun.target.position.copy(islandCenter);
      if (!scene.children.includes(sun.target)) scene.add(sun.target);
      if (typeof sunModel !== "undefined" && sunModel) {
        sunModel.lookAt(islandCenter);
      }

      // Petals
      (function addPetals() {
        const { minX, maxX, minZ, maxZ } = boundsXZ(islandRoot);
        const petalGeo = new THREE.CircleGeometry(0.035, 16);
        const baseMat = new THREE.MeshBasicMaterial({
          color: 0xff6fb0,
          side: THREE.DoubleSide,
          depthTest: true,
          depthWrite: true,
        });
        const PETALS = 15;
        for (let i = 0; i < PETALS; i++) {
          const x = rand(minX + 0.22, maxX - 0.22);
          const z = rand(minZ + 0.22, maxZ - 0.22);
          const hit = groundHitAt(x, z, islandMeshes);
          if (!hit) continue;

          const n =
            hit.face && hit.face.normal
              ? hit.face.normal.clone().normalize()
              : new THREE.Vector3(0, 1, 0);
          const q = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            n
          );

          const petal = new THREE.Mesh(petalGeo, baseMat.clone());
          petal.material.color.offsetHSL(0, 0, rand(-0.08, 0.08));
          petal.position.copy(hit.point).addScaledVector(n, 0.012);
          petal.quaternion.copy(q);
          petal.rotateOnAxis(n, rand(0, Math.PI * 2));
          petal.renderOrder = 999;
          scene.add(petal);
        }
        // Removed falling petals (performance)
      })();

      loader.load("/assets/house.glb", (hgltf) => {
        const house = hgltf.scene;
        house.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        house.scale.set(0.9, 0.9, 0.9);

        placeOnIsland(house, -0.8, 1.5, {
          sinkDepth: 0.03,
          alignToSlope: true,
        });

        const center = new THREE.Box3()
          .setFromObject(islandRoot)
          .getCenter(new THREE.Vector3());
        const pos = house.position.clone();
        house.lookAt(new THREE.Vector3(center.x, pos.y, center.z));
        scene.add(house);
        houseRef = house;
        doorTriggerLocal = computeDoorTriggerLocal(house);
        if (SHOW_DOOR_TRIGGER_DEBUG && doorTriggerLocal) {
          const size = new THREE.Vector3(
            doorTriggerLocal.max.x - doorTriggerLocal.min.x,
            doorTriggerLocal.max.y - doorTriggerLocal.min.y,
            doorTriggerLocal.max.z - doorTriggerLocal.min.z
          );
          const center = new THREE.Vector3(
            (doorTriggerLocal.min.x + doorTriggerLocal.max.x) * 0.5,
            (doorTriggerLocal.min.y + doorTriggerLocal.max.y) * 0.5,
            (doorTriggerLocal.min.z + doorTriggerLocal.max.z) * 0.5
          );
          const g = new THREE.BoxGeometry(size.x, size.y, size.z);
          const m = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            wireframe: true,
            transparent: true,
            opacity: 0.6,
            depthTest: false,
          });
          doorDebug = new THREE.Mesh(g, m);
          doorDebug.position.copy(center);
          house.add(doorDebug);
        }

        loader.load("/assets/tree.glb", (tgltf) => {
          const tree = tgltf.scene;
          tree.traverse((o) => {
            if (o.isMesh) o.castShadow = true;
          });
          tree.scale.set(0.9, 0.9, 0.9);

          const right = new THREE.Vector3(1, 0, 0).applyQuaternion(
            house.quaternion
          );
          const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(
            house.quaternion
          );
          const target = house.position
            .clone()
            .addScaledVector(right, 1.15)
            .addScaledVector(fwd, 0.6);

          placeOnIsland(tree, target.x, target.z, {
            sinkDepth: 0.1,
            alignToSlope: true,
          });
          tree.lookAt(
            new THREE.Vector3(
              house.position.x,
              tree.position.y,
              house.position.z
            )
          );
          scene.add(tree);
        });
        //left
        loader.load("/assets/tree2.glb", (t2gltf) => {
          const tree2 = t2gltf.scene;
          tree2.traverse((o) => {
            if (o.isMesh) o.castShadow = true;
          });
          tree2.scale.set(1.5, 1.5, 1.5);

          const right = new THREE.Vector3(1, 0, 0).applyQuaternion(
            house.quaternion
          );
          const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(
            house.quaternion
          );
          const target2 = house.position
            .clone()
            .addScaledVector(right, -1.3)
            .addScaledVector(fwd, 0.3);

          placeOnIsland(tree2, target2.x, target2.z, {
            sinkDepth: 0.05,
            alignToSlope: true,
          });
          tree2.rotation.y += THREE.MathUtils.degToRad(150);
          tree2.lookAt(
            new THREE.Vector3(
              house.position.x,
              tree2.position.y,
              house.position.z
            )
          );
          scene.add(tree2);
        });

        loader.load("/assets/tree2.glb", (tgltf) => {
          const tree = tgltf.scene;
          tree.traverse((o) => {
            if (o.isMesh) o.castShadow = true;
          });
          tree.scale.set(0.85, 0.85, 0.85);

          placeOnIslandByFrac(tree, 0.8, 0.09, {
            pad: 0.18,
            alignToSlope: true,
          });

          tree.lookAt(
            new THREE.Vector3(
              house.position.x,
              tree.position.y,
              house.position.z
            )
          );
          scene.add(tree);
        });

        loader.load("/assets/torii.glb", (ggltf) => {
          const torii = ggltf.scene;
          torii.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          torii.scale.set(0.88, 0.88, 0.88);

          let grassTop = null;
          islandRoot.traverse((o) => {
            if (!grassTop && o.isMesh) {
              const n = (o.name || "").toLowerCase();
              const m = (o.material?.name || "").toLowerCase();
              if (/grass|top/.test(n) || /grass|top/.test(m)) grassTop = o;
            }
          });
          if (!grassTop) grassTop = islandRoot;

          const box = new THREE.Box3().setFromObject(grassTop);
          const ctr = box.getCenter(new THREE.Vector3());

          placeOnIslandByFrac(torii, 0.23, 0.1, {
            pad: 0.2,
            alignToSlope: true,
          });

          const hp = new THREE.Vector3();
          house.getWorldPosition(hp);
          torii.lookAt(new THREE.Vector3(hp.x, torii.position.y, hp.z));
          torii.rotateY(THREE.MathUtils.degToRad(10));

          scene.add(torii);

          // Torii placed; stone path removed as requested
        });

        loader.load("/assets/bridge.glb", (bgltf) => {
          const bridge = bgltf.scene;
          bridge.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });

          const BRIDGE_POS = new THREE.Vector3(0.66, 2.69, -1.02);

          const BRIDGE_SCALE_X = 0.55;
          const BRIDGE_SCALE_Y = 0.55;
          const BRIDGE_SCALE_Z = 0.95;
          const BRIDGE_ROT_Y_DEG = 75;

          bridge.scale.set(BRIDGE_SCALE_X, BRIDGE_SCALE_Y, BRIDGE_SCALE_Z);
          bridge.position.copy(BRIDGE_POS);
          bridge.rotation.y = THREE.MathUtils.degToRad(BRIDGE_ROT_Y_DEG);

          scene.add(bridge);
          console.log("[bridge] placed at fixed coordinate", {
            position: bridge.position,
            scale: bridge.scale,
            rotYdeg: BRIDGE_ROT_Y_DEG,
          });
        });

        // Removed cherry blossom trees as requested

        // Stone path removed as requested

        // Add floating cherry blossom petals
        function addFloatingPetals() {
          const petalGeo = new THREE.PlaneGeometry(0.05, 0.08);
          const petalMat = new THREE.MeshBasicMaterial({
            color: 0xffc0cb,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
          });

          const petals = [];
          for (let i = 0; i < 20; i++) {
            const petal = new THREE.Mesh(petalGeo, petalMat.clone());
            petal.position.set(
              (Math.random() - 0.5) * 10,
              2 + Math.random() * 3,
              (Math.random() - 0.5) * 10
            );

            // Set bright pink color directly
            petal.material.color.setRGB(1.0, 0.75, 0.8); // Bright pink

            petal.userData.velocity = {
              x: (Math.random() - 0.5) * 0.01,
              y: -0.005 - Math.random() * 0.01,
              z: (Math.random() - 0.5) * 0.01,
            };

            petal.userData.rotationSpeed = (Math.random() - 0.5) * 0.02;

            scene.add(petal);
            petals.push(petal);
          }

          // Animate petals in the render loop
          return petals;
        }

        // Wait a bit for island to be fully loaded, then add decorations
        setTimeout(() => {
          window.floatingPetals = addFloatingPetals();
        }, 200); // Slightly longer delay to ensure torii is loaded
      });
    });

    (function trySpawnBoy() {
      const ready =
        islandMeshes.length > 0 && scene.children.includes(islandRoot);
      if (!ready) {
        requestAnimationFrame(trySpawnBoy);
        return;
      }
      loadBoy(scene, {
        onBoyLoaded: ({ model }) => {
          boy = model;

          const box = new THREE.Box3().setFromObject(islandRoot);
          const ctr = box.getCenter(new THREE.Vector3());

          const x = ctr.x + 0.2;
          const z = ctr.z + 0.2;
          placeOnIsland(model, x, z, { sinkDepth: 0.02, alignToSlope: true });
        },
      });
    })();

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    function onPointerDown(e) {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      mouse.set(x, y);
      raycaster.setFromCamera(mouse, camera);
      if (!boy) return;

      // Prefer clicking the house: if hit, set goal to house and compute approach point
      if (houseRef) {
        const houseHits = raycaster.intersectObject(houseRef, true);
        if (houseHits.length) {
          goalIsHouse = true;
          const ap = computeHouseApproachPoint();
          if (ap) targetPos.copy(ap);
          if (!isWalking) {
            isWalking = true;
            playBoy("walk");
          }
          return;
        }
      }

      // Otherwise, walk to ground point and clear house goal
      const hits = raycaster.intersectObjects(islandMeshes, true);
      if (!hits.length) return;
      const hit = hits[0];
      const n = (hit.object.name || "").toLowerCase();
      const m = (hit.object.material?.name || "").toLowerCase();
      if (/water|pond|lake|pool/.test(n) || /water|pond|lake|pool/.test(m)) return;
      goalIsHouse = false;
      targetPos.copy(hit.point);
      if (!isWalking) {
        isWalking = true;
        playBoy("walk");
      }
    }
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    // Render loop
    const clock = new THREE.Clock();
    let rafId = 0;
    const tick = () => {
      const dt = clock.getDelta();
      // Move boy toward target when walking
      if (boy && isWalking) {
        const pos = boy.position;
        const dir = new THREE.Vector3(
          targetPos.x - pos.x,
          0,
          targetPos.z - pos.z
        );
        const dist = dir.length();
        if (dist <= ARRIVE_RADIUS) {
          const hit = groundHitAt(targetPos.x, targetPos.z, islandMeshes);
          if (hit) boy.position.copy(hit.point);
          isWalking = false;
        } else {
          dir.normalize();
          // Clamp step to avoid large hitch-induced overshoot
          const step = Math.min(WALK_SPEED * dt, dist);
          const nx = pos.x + dir.x * step;
          const nz = pos.z + dir.z * step;
          const hit = groundHitAt(nx, nz, islandMeshes);
          if (hit) {
            boy.position.copy(hit.point);
          } else {
            boy.position.set(nx, pos.y, nz);
          }
          // Face movement direction
          if (step > 0.0001) {
            boy.rotation.y = Math.atan2(dir.x, dir.z);
          }
        }

        if (wasWalking && !isWalking) {
          playBoy("idle");
        }

        wasWalking = isWalking;
      }
      updateBoy(dt);

      // Doorway trigger attached to house (local-space box), only when heading to the house
      if (boy && houseRef && doorTriggerLocal && goalIsHouse) {
        const lp = houseRef.worldToLocal(boy.position.clone());
        const inside =
          lp.x >= doorTriggerLocal.min.x && lp.x <= doorTriggerLocal.max.x &&
          lp.y >= doorTriggerLocal.min.y && lp.y <= doorTriggerLocal.max.y &&
          lp.z >= doorTriggerLocal.min.z && lp.z <= doorTriggerLocal.max.z;
        if (inside && !enteredDoor) {
          enteredDoor = true;
          // Check subscription before entering
          if (!isSubscribed) {
            setShowSubscribePrompt(true);
          } else {
            router.push("/chat");
          }
        } else if (!inside) {
          enteredDoor = false;
        }
      }

      // Animate floating cherry blossom petals
      if (window.floatingPetals) {
        window.floatingPetals.forEach((petal) => {
          // Move petal
          petal.position.x += petal.userData.velocity.x;
          petal.position.y += petal.userData.velocity.y;
          petal.position.z += petal.userData.velocity.z;

          // Rotate petal
          petal.rotation.z += petal.userData.rotationSpeed;

          // Reset petal if it falls too low
          if (petal.position.y < -1) {
            petal.position.y = 4 + Math.random() * 2;
            petal.position.x = (Math.random() - 0.5) * 10;
            petal.position.z = (Math.random() - 0.5) * 10;
          }
        });
      }

      controls.update();
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(tick);
    };
    tick();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      cancelAnimationFrame(rafId);
      controls.dispose();
      pmrem.dispose();
      scene.environment = null;
      renderer.dispose();
      if (containerElement?.contains(renderer.domElement)) {
        containerElement.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Subscribe to Solana program
  async function subscribe() {
    setSubError("");
    setSubLoading(true);
    try {
      const { solana } = window;
      if (!solana?.isPhantom) {
        throw new Error("Phantom wallet not found!");
      }

      if (!walletAddress) {
        await connectWallet();
        return;
      }

      const connection = new Connection(SOLANA_RPC_URL, "confirmed");
      const programId = new PublicKey(SUBSCRIPTION_PROGRAM_ID);
      const userPublicKey = new PublicKey(walletAddress);

      // Derive PDAs (v2 for new structure)
      const [subscriptionPda] = await PublicKey.findProgramAddress(
        [Buffer.from("subscription_v2"), userPublicKey.toBuffer()],
        programId
      );

      const [vaultPda] = await PublicKey.findProgramAddress(
        [Buffer.from("vault")],
        programId
      );

      console.log("Program ID:", programId.toString());
      console.log("User:", userPublicKey.toString());
      console.log("Subscription PDA:", subscriptionPda.toString());
      console.log("Vault PDA:", vaultPda.toString());

      // Create subscribe instruction with proper Anchor discriminator
      // The discriminator is the first 8 bytes of sha256("global:subscribe")
      const instructionData = Buffer.from([
        0xfe, 0x1c, 0xbf, 0x8a, 0x9c, 0xb3, 0xb7, 0x35 // subscribe discriminator
      ]);

      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: subscriptionPda, isSigner: false, isWritable: true },
          { pubkey: userPublicKey, isSigner: true, isWritable: true },
          { pubkey: vaultPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
        ],
        programId: programId,
        data: instructionData
      });

      // Build transaction
      const transaction = new Transaction();
      transaction.add(instruction);
      
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = userPublicKey;

      // Sign transaction with Phantom
      const signedTransaction = await solana.signTransaction(transaction);
      console.log("Transaction signed");

      // Send the signed transaction
      const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed"
      });
      console.log("Transaction sent:", signature);

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      }, "confirmed");

      if (confirmation.value.err) {
        throw new Error("Transaction failed: " + JSON.stringify(confirmation.value.err));
      }

      console.log("Transaction confirmed!");

      // Refresh subscription status
      await checkSubscription(userPublicKey);
      setShowSubscribePrompt(false);
      
      alert(isSubscribed 
        ? "Subscription renewed! Added 30 more days." 
        : "Successfully subscribed for 30 days! You can now enter the house.");
    } catch (e) {
      console.error("Subscription error:", e);
      setSubError(e?.message || "Failed to subscribe");
    } finally {
      setSubLoading(false);
    }
  }

  return (
    <>
      <div ref={containerRef} style={{ width: "100vw", height: "100vh" }} />
      
      {/* Floating Wallet/Subscribe Button */}
      <div style={{
        position: 'fixed',
        bottom: 40,
        left: 20,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        {!walletAddress ? (
          <button
            onClick={connectWallet}
            style={{
              padding: '12px 24px',
              background: 'linear-gradient(135deg, #9945FF 0%, #8A2BE2 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              backdropFilter: 'blur(10px)'
            }}
          >
            Connect Phantom
          </button>
        ) : (
          <>
            <div style={{
              padding: '12px 16px',
              background: 'rgba(255,255,255,0.95)',
              border: '1px solid rgba(153, 69, 255, 0.3)',
              borderRadius: 12,
              fontSize: 12,
              color: '#333',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              textAlign: 'center'
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
              </div>
              <div style={{ fontSize: 11, color: isSubscribed ? '#10b981' : '#f59e0b' }}>
                {isSubscribed 
                  ? `✓ Active (${daysRemaining} days left)` 
                  : expiresAt 
                    ? '⚠ Expired' 
                    : 'Not Subscribed'}
              </div>
            </div>
            
            <button
              onClick={() => setShowSubscribePrompt(true)}
              disabled={subLoading}
              style={{
                padding: '12px 24px',
                background: subLoading ? '#ccc' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 600,
                cursor: subLoading ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                backdropFilter: 'blur(10px)'
              }}
            >
              {subLoading 
                ? 'Processing...' 
                : isSubscribed 
                  ? 'Renew (0.001 SOL)' 
                  : 'Subscribe (0.001 SOL)'}
            </button>
          </>
        )}
      </div>

      {showSubscribePrompt && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}>
          <div
            className="w-full max-w-md"
            style={{
              background: 'rgba(255,255,255,0.25)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.4)',
              borderRadius: 20,
              boxShadow: '0 10px 30px rgba(0,0,0,0.35)'
            }}
          >
            <div className="flex items-center justify-between" style={{ padding: '12px 16px' }}>
              <h3 style={{ color: '#fff', fontWeight: 600 }}>
                {isSubscribed ? 'Renew Subscription' : 'Subscribe to Enter'}
              </h3>
              <button onClick={() => setShowSubscribePrompt(false)} style={{ color: 'rgba(255,255,255,0.9)' }}>✕</button>
            </div>
            {subError && <div className="text-sm" style={{ color: '#fecaca', padding: '0 16px 8px' }}>{subError}</div>}
            
            <div style={{ padding: '16px', textAlign: 'center' }}>
              <p style={{ color: '#fff', marginBottom: '16px', fontSize: 14 }}>
                {isSubscribed 
                  ? `Extend your subscription by 30 days (Currently ${daysRemaining} days remaining)`
                  : 'Subscribe with 0.001 SOL for 30 days of access'}
              </p>
              
              {!walletAddress ? (
                <button
                  onClick={connectWallet}
                  style={{
                    width: '100%',
                    padding: '12px 24px',
                    background: 'linear-gradient(135deg, #9945FF 0%, #8A2BE2 100%)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 12,
                    fontSize: 16,
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginBottom: '12px'
                  }}
                >
                  Connect Phantom Wallet
                </button>
              ) : (
                <>
                  <div style={{
                    background: 'rgba(255,255,255,0.35)',
                    border: '1px solid rgba(255,255,255,0.4)',
                    borderRadius: 16,
                    padding: '16px',
                    marginBottom: '16px'
                  }}>
                    <div style={{ color: '#111', fontWeight: 700, fontSize: 20, marginBottom: '8px' }}>
                      {SUBSCRIPTION_AMOUNT} SOL
                    </div>
                    <div style={{ color: '#374151', fontSize: 14 }}>
                      30 days subscription
                    </div>
                  </div>
                  
                  <button
                    disabled={subLoading}
                    onClick={subscribe}
                    style={{
                      width: '100%',
                      padding: '12px 24px',
                      background: subLoading ? '#ccc' : 'linear-gradient(135deg, #9945FF 0%, #8A2BE2 100%)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 12,
                      fontSize: 16,
                      fontWeight: 600,
                      cursor: subLoading ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {subLoading ? 'Processing…' : (isSubscribed ? 'Renew Subscription' : 'Subscribe Now')}
                  </button>
                  
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: '12px' }}>
                    Wallet: {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
