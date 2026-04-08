from huggingface_hub import upload_folder

upload_folder(
    folder_path="training/models/harmony_model",
    repo_id="rayanmahmoud/harmony_model",
    repo_type="model"
)
