
export const POSSIBLE_POSES = [
  // Basic / Symmetrical
  "arms raised high in a V shape",
  "arms crossed over chest",
  "hands on hips",
  "muscle flex (double biceps)",
  "hands forming a heart shape above head",
  "hands touching shoulders",
  
  // Asymmetrical / Action
  "saluting with right hand",
  "one hand waving, one hand down",
  "pointing both fingers to the right",
  "blocking face like a boxer",
  "right arm pointing straight up, left hand on hip",
  "arms in an L shape: left arm vertical, right arm horizontal",
  
  // Complex / Abstract
  "hands clasped behind the head",
  "fingertips touching together forming a triangle in front of chest",
  "right hand touching left shoulder, left arm straight down",
  "one arm pointing diagonal up-left, other diagonal down-right",
  "framing the face with both hands (square shape)",
  "right elbow resting on left hand palm, right hand near chin (thinking pose)",
  "both arms extended to the left side parallel to each other",
  "wrists crossed above head in an X shape",

  // New Challenging Poses
  "both hands covering ears with elbows pointing out",
  "palms pressed together in prayer position at center of chest",
  "wrapping arms around body in a tight self-hug",
  "right arm curved over head like a halo, left arm down",
  "both arms extended straight forward towards camera, palms open",
  "arms extended to sides with elbows bent 90 degrees up (goalpost shape)",
  "right hand on forehead in a dramatic pose, left hand reaching forward",
  "fingers interlocked, palms stretching upwards above head",
  "right hand touching left ear by going over the top of the head",
  "hands making binoculars shape around eyes"
];

export const DIFFICULTY_CONFIG = {
  EASY: {
    label: "Easy",
    threshold: 60,
    complexityPrompt: "Simple symmetrical structure, very clear silhouette, distinct limb separation, limbs fully extended or clearly bent."
  },
  MEDIUM: {
    label: "Medium",
    threshold: 75,
    complexityPrompt: "Standard pose, mix of symmetry and asymmetry, natural joint angles, 8-12 key points."
  },
  HARD: {
    label: "Hard",
    threshold: 80,
    complexityPrompt: "Complex asymmetrical structure, precise joint angles (e.g. 45 or 90 degrees), overlapping limbs allowed, intricate hand positioning, 12+ key points."
  }
};

// Based on user request description
export const GENERATE_SKELETON_PROMPT = (poseDescription: string, complexityDetail: string) => `
Create a minimalist upper-body character outline wireframe map.
Image Description:
Style: Minimalist wireframe, dot and line connection.
Content: Upper body outline of a person, from head to waist.
Elements: Hollow circles (blue) represent joints, thin straight lines (black) represent connections.
Background: Pure white or transparent.
Colors: Black lines, Blue dots (#0000FF).
Pose: ${poseDescription}.
Perspective: Front view.
Style: Abstract, like a skeleton chart.
Complexity: ${complexityDetail}
Technical Requirements:
Resolution: 400x300 pixels.
Line thickness: 2-3 pixels.
Dot size: 6-8 pixels.
Excluded Content: No facial features, no clothing details, no shadows or gradients, no color fill, no background patterns.
`;

export const COMPARE_POSE_SYSTEM_INSTRUCTION = `
You are a strict pose estimation referee for a game.
Your task is to compare a User Webcam Photo to a Target Wireframe Skeleton.
1. Analyze the upper body pose in the User Photo.
2. Compare angles of arms, shoulders, and head tilt to the Target Wireframe.
3. Ignore background, lighting, or clothing. Focus ONLY on the geometry of the skeleton.
4. Return a JSON object with a 'score' (0-100) integer.
5. If the pose matches closely (angles within ~15 degrees), score > 75.
6. If the user is not visible or pose is completely wrong, score < 40.
`;
