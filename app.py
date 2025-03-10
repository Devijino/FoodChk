import os
import pandas as pd
from flask import Flask, render_template, request, jsonify
import time
import threading
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__, template_folder='app/templates', static_folder='app/static')

# Global variable to store data in memory
food_data = None
last_loaded_time = 0
is_loading = False
loading_lock = threading.Lock()

def load_food_data():
    """
    Load food data from CSV file efficiently with chunking
    """
    global food_data, last_loaded_time, is_loading
    
    csv_path = 'template-2-main/mitzrachim_final_hebrew.csv'
    
    with loading_lock:
        if is_loading:
            # Another thread is already loading the data
            return None
        is_loading = True
    
    try:
        logger.info(f"Loading CSV data from {csv_path}")
        start_time = time.time()
        
        # Read CSV in chunks to handle large files
        chunks = []
        for chunk in pd.read_csv(csv_path, encoding='utf-8', chunksize=5000):
            chunks.append(chunk)
        
        # Combine chunks
        combined_df = pd.concat(chunks, ignore_index=True)
        
        # Store original column names for reference
        original_columns = list(combined_df.columns)
        logger.info(f"Original columns: {original_columns}")
        
        # DO NOT normalize column names - keep Hebrew intact
        # We'll rely on the JavaScript column mapping instead
        
        # Fill NA values with empty strings for string columns
        for col in combined_df.select_dtypes(include=['object']).columns:
            combined_df[col] = combined_df[col].fillna('')
        
        loading_time = time.time() - start_time
        logger.info(f"CSV loaded successfully in {loading_time:.2f} seconds. Shape: {combined_df.shape}")
        logger.info(f"Available columns: {list(combined_df.columns)}")
        
        with loading_lock:
            food_data = combined_df
            last_loaded_time = time.time()
            is_loading = False
            
        return food_data
    
    except Exception as e:
        logger.error(f"Error loading CSV: {str(e)}")
        with loading_lock:
            is_loading = False
        return None

def get_cached_food_data():
    """
    Get food data, either from cache or load from file
    """
    global food_data, last_loaded_time
    
    # If data is not loaded yet or it's older than 30 minutes, reload
    current_time = time.time()
    cache_timeout = 30 * 60  # 30 minutes
    
    if food_data is None or (current_time - last_loaded_time) > cache_timeout:
        return load_food_data()
    
    return food_data

@app.route('/')
def index():
    """
    Render the main page
    """
    # Trigger data loading in background if needed
    if food_data is None:
        threading.Thread(target=load_food_data).start()
    
    return render_template('index.html')

@app.route('/api/food', methods=['GET'])
def get_food_data():
    """
    API endpoint to get food data with filtering and pagination
    """
    # Get query parameters
    query = request.args.get('query', '').strip().lower()
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 20))
    
    try:
        # Get data from cache or load it
        df = get_cached_food_data()
        
        if df is None:
            return jsonify({'error': 'Unable to load food data'}), 500
        
        # Filter by search query if provided
        if query:
            # Search in all string columns
            mask = pd.Series(False, index=df.index)
            string_columns = df.select_dtypes(include=['object']).columns
            
            for col in string_columns:
                # Handle potential errors in string contains operation
                try:
                    mask |= df[col].str.lower().str.contains(query, na=False)
                except Exception as e:
                    logger.warning(f"Error searching in column {col}: {str(e)}")
            
            filtered_df = df[mask]
        else:
            filtered_df = df
        
        # Calculate total items and pages
        total_items = len(filtered_df)
        total_pages = (total_items + per_page - 1) // per_page
        
        # Paginate results
        start_idx = (page - 1) * per_page
        end_idx = min(start_idx + per_page, total_items)
        
        if start_idx >= total_items:
            paginated_data = []
        else:
            paginated_df = filtered_df.iloc[start_idx:end_idx]
            # Convert to list of dictionaries
            paginated_data = paginated_df.to_dict(orient='records')
        
        return jsonify({
            'data': paginated_data,
            'page': page,
            'per_page': per_page,
            'total_items': total_items,
            'total_pages': total_pages
        })
    
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/columns', methods=['GET'])
def get_columns():
    """
    API endpoint to get the column names from the CSV
    """
    try:
        df = get_cached_food_data()
        
        if df is None:
            return jsonify({'error': 'Unable to load food data'}), 500
            
        columns = list(df.columns)
        return jsonify({'columns': columns})
        
    except Exception as e:
        logger.error(f"Error getting columns: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Load data on startup
    threading.Thread(target=load_food_data).start()
    
    # Start the Flask app
    app.run(debug=True, host='0.0.0.0', port=5000) 